import OpenAI from 'openai'
import { mcqPrompt, aptitudePrompt, behavioralMcqPrompt } from './prompts/mcq.prompt'
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

type McqCategory = 'TECHNICAL' | 'APTITUDE' | 'BEHAVIORAL'

function splitEvenly(total: number, keys: readonly McqCategory[]): Record<McqCategory, number> {
  const safeTotal = Math.max(1, Number(total || 0))
  const base = Math.floor(safeTotal / keys.length)
  const remainder = safeTotal % keys.length
  const out = { TECHNICAL: base, APTITUDE: base, BEHAVIORAL: base }
  for (let i = 0; i < remainder; i += 1) out[keys[i]] += 1
  return out
}

function toQuestionArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw?.questions)) return raw.questions
  return []
}

function withCategoryTag(items: any[], category: McqCategory) {
  return items.map((q) => {
    const existing = String(q?.topicTag || '').replace(/^(TECHNICAL|APTITUDE|BEHAVIOU?RAL)\s*:\s*/i, '').trim()
    return {
      ...q,
      type: q?.type || 'MCQ',
      topicTag: `${category}: ${existing || 'General'}`,
    }
  })
}

// ── MCQ Generation ─────────────────────────────────────────────
export async function generateMCQs(jd: string, role: string, cfg: any) {
  const split = splitEvenly(cfg.totalQuestions || 20, ['TECHNICAL', 'APTITUDE', 'BEHAVIORAL'])

  const jobs: Array<Promise<{ category: McqCategory; questions: any[] }>> = []

  if (split.TECHNICAL > 0) {
    jobs.push(
      chat(mcqPrompt(jd, role, { ...cfg, questionMode: 'JD_BASED', totalQuestions: split.TECHNICAL }))
        .then((res) => ({ category: 'TECHNICAL' as McqCategory, questions: toQuestionArray(res) })),
    )
  }

  if (split.APTITUDE > 0) {
    jobs.push(
      chat(aptitudePrompt({ ...cfg, questionMode: 'APTITUDE', totalQuestions: split.APTITUDE }))
        .then((res) => ({ category: 'APTITUDE' as McqCategory, questions: toQuestionArray(res) })),
    )
  }

  if (split.BEHAVIORAL > 0) {
    jobs.push(
      chat(behavioralMcqPrompt(role, { ...cfg, totalQuestions: split.BEHAVIORAL }))
        .then((res) => ({ category: 'BEHAVIORAL' as McqCategory, questions: toQuestionArray(res) })),
    )
  }

  const generated = await Promise.all(jobs)
  return generated.flatMap(({ category, questions }) => withCategoryTag(questions, category))
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
  hiringType?: string
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

// ── Interview Answer Evaluation — context-aware ───────────────
export async function evaluateInterviewAnswer(params: {
  prompt: string
  answer: string
  rubric: string
  role: string
  category?: string  // WARMUP | CORE_TECHNICAL | SCENARIO | BEHAVIOURAL | CURVEBALL | RESUME_DRILL
  topicTag?: string
}): Promise<{ score: number; reasoning: string; followUp?: string }> {

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
${categoryContext}
Topic: ${params.topicTag || 'General'}

QUESTION ASKED:
"${params.prompt}"

EVALUATION RUBRIC (what a strong answer covers):
${params.rubric}

CANDIDATE'S ANSWER:
"${params.answer}"

Evaluate strictly against the rubric. Do not give benefit of the doubt.
- If they give buzzwords without explanation: score 3-4 max
- If they describe theory without practical application: score 5-6 max
- If their answer contradicts the rubric's red flags: score 1-3
- Only 9-10 if they hit all MUST MENTION items AND show a green flag signal

Respond ONLY with JSON:
{
  "score": <0-10>,
  "reasoning": "2-3 sentences — cite specific parts of their answer, reference the rubric",
  "followUp": "specific follow-up question to probe a weakness, or null if score >= 8"
}`

  const res = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [{ role: 'user', content: evalPrompt }],
    response_format: { type: 'json_object' },
  })
  return JSON.parse(res.choices[0].message.content || '{"score":0,"reasoning":""}')
}

// ── LIVE_CODING Explanation Evaluation ────────────────────────
export async function evaluateCodeExplanation(params: {
  problem: string
  code: string
  language: string
  transcript: string
  rubric: string
  role: string
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