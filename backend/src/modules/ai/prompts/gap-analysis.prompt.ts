export function gapAnalysisPrompt(input: {
  jobDescription:   string
  role:             string
  hiringType?:      string
  resumeText:       string
  roundScores:      any[]
  strikeCount:      number
  maxStrikes:       number
  interviewAnswers: any[]
}): string {

  // ── Compact helpers ─────────────────────────────────────────────
  // Truncate helpers — keep only what the model needs to reason
  const jd       = (input.jobDescription || '').slice(0, 1200)
  const resume   = (input.resumeText     || 'Not provided').slice(0, 1500)
  const track    = (input.hiringType     || 'LATERAL').toUpperCase()

  // Round scores — one line each
  const roundSummary = input.roundScores.length
    ? input.roundScores.map((r, i) =>
        `R${i + 1} ${r.roundType ?? ''}: ${r.percentScore?.toFixed(1) ?? 0}% ${r.passed ? 'PASS' : 'FAIL'}`
      ).join(' | ')
    : 'No rounds'

  // Interview answers — short digest per question (score + brief excerpt + reasoning)
  const answers = input.interviewAnswers.slice(0, 8)
  const interviewDigest = answers.map((a, i) => {
    const excerpt   = (a.answer  || '').slice(0, 400)   // was 2500
    const reasoning = (a.aiReasoning || '').slice(0, 150) // was 1000
    return `Q${i+1}[${a.topicTag || 'General'}] ${a.aiScore ?? '?'}/10: "${excerpt}" — ${reasoning}`
  }).join('\n')

  // Live coding signals — compact
  const lcAnswers = input.interviewAnswers.filter(a =>
    a.mode === 'LIVE_CODING' || a.mode === 'TEXT_LIVE_CODING' || a.mode === 'AUDIO_LIVE_CODING'
  )
  const lcSignals = lcAnswers.length
    ? `LC: ${lcAnswers.map(a => `code=${a.codeScore??0} explain=${a.explainScore??0}${a.copiedCodeSignal?' ⚠COPY':''}`).join(' | ')}`
    : ''
  const copiedCount = lcAnswers.filter(a => a.copiedCodeSignal).length

  // Proctoring
  const proctoring = input.strikeCount >= input.maxStrikes
    ? `⚠ TERMINATED: ${input.strikeCount}/${input.maxStrikes} strikes`
    : input.strikeCount > 0
      ? `${input.strikeCount}/${input.maxStrikes} strikes`
      : 'Clean'

  return `You are a senior technical recruiter. Produce a final evaluation for a ${input.role} candidate.
Track: ${track}${track === 'CAMPUS' ? ' (prioritise fundamentals, learning agility, communication)' : ' (prioritise production depth, ownership, architecture)'}

JD (key excerpt):
${jd}

RESUME (key excerpt):
${resume}

ROUNDS: ${roundSummary}
PROCTORING: ${proctoring}
${lcSignals ? lcSignals + '\n' : ''}${copiedCount > 0 ? `⚠ ${copiedCount} copy-paste signal(s) — cap technical fit ≤65%\n` : ''}
INTERVIEW (score/10, answer excerpt, AI note):
${interviewDigest || 'No data'}

Return ONLY valid JSON (no markdown). All string fields must be concise.
Scoring weights: interview 40%, MCQ/coding 40%, resume-JD 20%.
${track === 'CAMPUS' ? 'For CAMPUS: leadership field is optional if no signal.' : ''}

{
  "technicalFitPercent": <0-100>,
  "strengths": ["evidence-backed strength"],
  "gaps": ["specific gap with evidence"],
  "jdMatchedSkills": ["skill"],
  "jdMissingSkills": ["skill"],
  "jdSkillSplit": {
    "mustHave":   [{"skill":"","status":"MATCHED|PARTIAL|MISSING","evidence":"","comment":""}],
    "goodToHave": [{"skill":"","status":"MATCHED|PARTIAL|MISSING","evidence":"","comment":""}],
    "niceToHave": [{"skill":"","status":"MATCHED|PARTIAL|MISSING","evidence":"","comment":""}]
  },
  "technicalSkillMatrix": [{"skill":"","performanceScore":0,"performanceLabel":"EXCELLENT|GOOD|AVERAGE|WEAK","comment":""}],
  "resumeJDFitScore": <0-100>,
  "resumeEvaluationNotes": "3-4 sentences: resume vs JD alignment",
  "resumeCredibility": "HIGH|MEDIUM|LOW",
  "resumeCredibilityReason": "1-2 sentences",
  "behavioralProfile": "2-3 sentences on soft skills from transcripts",
  "behavioralScores": {"communication":0,"confidence":0,"leadership":0,"comment":""},
  "copiedCodeDetected": <true|false>,
  "aiSummary": "3-4 sentence executive summary: recommendation tone, top strength, top gap, integrity notes",
  "keyMoments": [{"type":"strength|weakness","questionTopic":"","evidence":""}],
  "hiringRisk": "LOW|MEDIUM|HIGH",
  "hiringRiskReason": "1-2 sentences",
  "onboardingRecommendations": ["specific action for day 1-90"]
}`
}