import OpenAI from 'openai'
import { mcqPrompt, aptitudePrompt } from './prompts/mcq.prompt'
import { codingPrompt, dsaPrompt } from './prompts/coding.prompt'
import {
  interviewPrompt,
  resumeAwareInterviewPrompt,
  liveCodingPrompt,
  explanationEvalPrompt,
} from './prompts/interview.prompt'
import { gapAnalysisPrompt } from './prompts/gap-analysis.prompt'

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

export const MODEL = 'llama-3.3-70b-versatile'
const STT_MODEL = 'whisper-large-v3-turbo'

async function chat(prompt: string, temperature = 0.8): Promise<any> {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature,
  })
  return JSON.parse(res.choices[0].message.content || '{}')
}

// ── MCQ Generation ─────────────────────────────────────────────
export async function generateMCQs(jd: string, role: string, cfg: any) {
  const mode = cfg.questionMode || 'JD_BASED'
  const prompt = mode === 'APTITUDE' ? aptitudePrompt(cfg) : mcqPrompt(jd, role, cfg)
  const result = await chat(prompt)
  return result.questions || result
}

// ── Coding Generation ──────────────────────────────────────────
export async function generateCodingProblems(jd: string, role: string, cfg: any) {
  const mode = cfg.questionMode || 'JD_BASED'
  const prompt = mode === 'DSA' ? dsaPrompt(cfg) : codingPrompt(jd, role, cfg)
  const result = await chat(prompt)
  return result.problems || result
}

// ── Interview Generation — resume-aware + LIVE_CODING support ──
export async function generateInterviewPrompts(
  jd: string, role: string, cfg: any, resumeText?: string
) {
  const mode = cfg.interviewMode || 'TEXT'

  // Hybrid modes — (questionCount-1) regular interview questions + 1 live coding problem
  if (mode === 'TEXT_LIVE_CODING' || mode === 'AUDIO_LIVE_CODING') {
    const regularCfg  = { ...cfg, questionCount: Math.max(1, (cfg.questionCount || 5) - 1) }
    const lcCfg       = { ...cfg, questionCount: 1 }

    const [regularResult, lcResult] = await Promise.all([
      resumeText && resumeText.length > 100 && (cfg.resumeSplit || 0) > 0
        ? chat(resumeAwareInterviewPrompt(jd, role, resumeText, regularCfg))
        : chat(interviewPrompt(jd, role, regularCfg)),
      chat(liveCodingPrompt(jd, role, resumeText || '', lcCfg)),
    ])

    const regularPrompts  = (regularResult.prompts || []) as any[]
    const liveCodingItems = (lcResult.problems   || []) as any[]

    // Inject the live coding problem at a random midpoint so it doesn't always land last
    const insertAt = Math.floor(regularPrompts.length / 2)
    return [
      ...regularPrompts.slice(0, insertAt),
      ...liveCodingItems,
      ...regularPrompts.slice(insertAt),
    ]
  }

  // Resume-aware if resume text provided and resumeSplit > 0
  if (resumeText && resumeText.length > 100 && (cfg.resumeSplit || 0) > 0) {
    const prompt = resumeAwareInterviewPrompt(jd, role, resumeText, cfg)
    const result = await chat(prompt)
    return result.prompts || result
  }

  // Standard JD-based
  const prompt = interviewPrompt(jd, role, cfg)
  const result = await chat(prompt)
  return result.prompts || result
}

// ── Gap Analysis ───────────────────────────────────────────────
export async function runGapAnalysis(input: {
  jobDescription: string
  role: string
  resumeText: string
  roundScores: any[]
  strikeCount: number
  maxStrikes: number
  interviewAnswers: any[]
}) {
  const prompt = gapAnalysisPrompt(input)
  const result = await chat(prompt, 0.4)
  const strikePenalty = (input.strikeCount / input.maxStrikes) * 20
  const trustScore = Math.max(0, Math.min(100, 100 - strikePenalty))
  return { ...result, trustScore }
}

export async function evaluateInterviewAnswer(params: {
  prompt: string
  answer: string
  rubric: string
  role: string
  category?: string  // WARMUP | CORE_TECHNICAL | SCENARIO | BEHAVIOURAL | CURVEBALL | RESUME_DRILL
  topicTag?: string
  depth?: string
}): Promise<{ score: number; reasoning: string; correctness: number; communication: number; confidence: number; followUp?: string }> {

  const depth = params.depth || 'DEEP'
  const categoryContext = params.category
    ? `Question category: ${params.category}. ${params.category === 'RESUME_DRILL'
      ? 'This question is probing a specific claim on their resume — verify whether the answer demonstrates genuine hands-on experience or surface-level knowledge.'
      : params.category === 'SCENARIO'
        ? 'This is a production scenario question — evaluate whether they show real operational experience and sound judgment under pressure.'
        : params.category === 'BEHAVIOURAL'
          ? 'This is a STAR-method question — penalise vague generalities, reward specific examples with measurable outcomes.'
          : params.category === 'CURVEBALL'
            ? 'This is a curveball question — evaluate the quality of their THINKING PROCESS, not whether they got a specific answer.'
            : ''
    }`
    : ''

  const evalPrompt = `You are evaluating a ${params.role} candidate interview answer. 
You are performing a ${depth === 'DEEP' ? 'deep dive' : 'breadth-first'} technical review.
${categoryContext}
Topic: ${params.topicTag || 'General'}

QUESTION ASKED:
"${params.prompt}"

EVALUATION RUBRIC (what a strong answer covers):
${params.rubric}

CANDIDATE'S ANSWER:
"${params.answer}"

Evaluate strictly against the rubric. 
Score the following metrics (0-10):
1. **Correctness**: How accurate and technically sound is the answer?
2. **Communication**: How clear, structured, and easy to understand is the explanation?
3. **Confidence**: Does the candidate speak with authority and conviction without being arrogant?

Respond ONLY with JSON:
{
  "score": <overall score 0-10>,
  "reasoning": "2-3 sentences summary",
  "correctness": <0-10>,
  "communication": <0-10>,
  "confidence": <0-10>,
  "followUp": "natural conversational follow-up if score < 8. ${depth === 'DEEP' ? 'Probed for deeper technical understanding if candidate is strong, or ask for architectural trade-offs.' : 'Ask for a simpler logic check or a high-level overview.'}. Return null if overall score >= 8."
}`

  const res = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [{ role: 'user', content: evalPrompt }],
    response_format: { type: 'json_object' },
  })
  return JSON.parse(res.choices[0].message.content || '{"score":0,"reasoning":"","correctness":0,"communication":0,"confidence":0}')
}

// ── LIVE_CODING Explanation Evaluation ────────────────────────
export async function evaluateCodeExplanation(params: {
  problem: string
  code: string
  language: string
  transcript: string
  rubric: string
  role: string
  depth?: string
}): Promise<{
  score: number
  reasoning: string
  copiedCodeSignal: boolean
  followUp?: string
}> {
  const prompt = explanationEvalPrompt(params)
  const res = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  })
  return JSON.parse(res.choices[0].message.content || '{"score":0,"reasoning":"","copiedCodeSignal":false}')
}

// ── Speech to Text (Groq Whisper) ──────────────────────────────
export async function transcribeAudio(audioBuffer: Buffer): Promise<{ text: string }> {
  const ab = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength)
  const blob = new Blob([ab as ArrayBuffer], { type: 'audio/webm' })
  const file = new File([blob], 'answer.webm', { type: 'audio/webm' })
  const result = await openai.audio.transcriptions.create({
    model: STT_MODEL,
    file,
    response_format: 'json',
  })
  return { text: result.text }
}

export async function generateTTS(_text: string): Promise<Buffer> {
  throw new Error('TTS is handled on the frontend via the Web Speech API')
}