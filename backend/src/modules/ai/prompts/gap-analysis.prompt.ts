export function gapAnalysisPrompt(input: {
  jobDescription:   string
  role:             string
  resumeText:       string
  roundScores:      any[]
  strikeCount:      number
  maxStrikes:       number
  interviewAnswers: any[]
}): string {

  // Format round scores clearly
  const roundSummary = input.roundScores.map((r: any, i: number) =>
    `Round ${i + 1} (${r.roundType}): ${r.percentScore?.toFixed(1) ?? 0}% — ${r.passed ? 'PASSED' : 'FAILED'}`
  ).join('\n')

  const interviewSummary = input.interviewAnswers.slice(0, 6).map((a: any) =>
    `Q [${a.topicTag || 'General'}]: "${a.prompt?.slice(0, 150)}..."
     Score: ${a.aiScore ?? 'N/A'}/10
     Answer Transcript: ${(a.answer || '').slice(0, 2500)}
     AI Evaluation: ${(a.aiReasoning || '').slice(0, 1000)}`
  ).join('\n\n')

  // LIVE_CODING signals
  const liveCodingAnswers = input.interviewAnswers.filter((a: any) =>
    a.mode === 'LIVE_CODING' || a.mode === 'TEXT_LIVE_CODING' || a.mode === 'AUDIO_LIVE_CODING'
  )
  const copiedSignals     = liveCodingAnswers.filter((a: any) => a.copiedCodeSignal).length
  const liveCodingSummary = liveCodingAnswers.length > 0
    ? `LIVE CODING RESULTS:
${liveCodingAnswers.map((a: any) => `- Code score: ${a.codeScore ?? 0}/10, Explanation score: ${a.explainScore ?? 0}/10, Combined: ${a.aiScore?.toFixed(1) ?? 0}/10${a.copiedCodeSignal ? ' ⚠ COPY-PASTE SIGNAL DETECTED' : ''}`).join('\n')}
${copiedSignals > 0 ? `⚠ ${copiedSignals} problem(s) showed evidence of AI-generated or copied code — candidate's explanation did not match their submitted code.` : 'No copy-paste signals detected.'}`
    : ''

  return `You are a senior technical recruiter producing a final evaluation report for a ${input.role} candidate.

JOB DESCRIPTION:
${input.jobDescription}

CANDIDATE RESUME:
${(input.resumeText || 'Not provided').slice(0, 4000)}

ASSESSMENT PERFORMANCE:
${roundSummary || 'No rounds completed'}

INTERVIEW PERFORMANCE:
${interviewSummary || 'No interview data available'}

${liveCodingSummary}

PROCTORING:
Violations: ${input.strikeCount} out of max ${input.maxStrikes} strikes
${input.strikeCount >= input.maxStrikes ? '⚠ Session was terminated due to proctoring violations.' : input.strikeCount > 0 ? `⚠ ${input.strikeCount} proctoring violation(s) recorded.` : 'Clean session — no violations.'}

INSTRUCTIONS FOR YOUR ANALYSIS:

1. TECHNICAL FIT % (0–100):
   - Base on actual assessment performance, not resume claims
   - Weight: Interview scores 40%, MCQ/Coding scores 40%, Resume-JD match 20%
   - Penalise if resume claims contradict weak interview performance on that topic
   - If live coding copy-paste signals detected, cap technical fit at 65% max

2. STRENGTHS:
   - Only list strengths PROVEN by assessment scores, not resume claims
   - Each strength must cite evidence: "Strong React knowledge (8.5/10 interview score on hooks question)"

3. SKILL GAPS:
   - Skills required by JD that candidate demonstrated weakness in
   - Be specific: "Unable to explain SQL index optimisation despite claiming 3 years DB experience"
   - Note if gap appears in both interview AND resume (possible exaggeration)

4. JD SKILL MATCH:
   - Skills from JD the candidate demonstrably has (backed by good scores)

5. JD MISSING SKILLS:
   - Skills from JD the candidate is missing or underperformed on

6. RESUME VS JD MATCH SCORE (new field):
   - Score out of 100 representing how well the candidate's resume itself aligns with the Job Description.

7. RESUME EVALUATION NOTES (new field):
   - A detailed 3-4 sentence paragraph evaluating the candidate's resume relative to the JD requirements. What is missing? What aligns perfectly?

8. RESUME CREDIBILITY & RED FLAGS (new field):
   - Flag if interview performance significantly contradicts resume claims.
   - e.g. "Claims senior Node.js developer but scored 3/10 on async/await question"
   - Rate Credibility: HIGH / MEDIUM / LOW
   - Provide "credibilityReason" explaining any red flags or confirming consistency.

9. BEHAVIORAL & COMMUNICATION PROFILE (new field):
   - Analyze the candidate's answers for soft skills (Clarity, Problem Solving, Resilience, Leadership).
   - Provide a 2-3 sentence summary of their communication style based on the transcripts.

10. AI SUMMARY (3-4 sentences for the recruiter):
   - Start with overall recommendation tone (Strong hire / Hire / Maybe / No hire)
   - Highlight the most important strength
   - Highlight the most important gap
   - Note any integrity concerns (proctoring, copy-paste signals, resume credibility)

11. KEY MOMENTS:
   - Identify 2-3 defining moments from the interview that highlight core strengths or critical weaknesses.
   - For each moment, return an object with \`type\` ("strength" or "weakness"), \`questionTopic\`, and \`evidence\` (direct quote or specific observation).

12. HIRING RISK & REASON:
   - Assess the overall risk of hiring this candidate: LOW, MEDIUM, or HIGH.
   - Provide a \`hiringRiskReason\` justifying this level based on technical gaps, copy-paste signals, or behavioural red flags.

13. ONBOARDING RECOMMENDATIONS:
   - Provide an array of 2-3 specific, actionable recommendations for the candidate's first 90 days.
   - E.g., "Assign to a senior mentor for microservices architecture", "Needs immediate training on React best practices".

Respond ONLY with valid JSON — no markdown:
{
  "technicalFitPercent": <0-100>,
  "strengths": ["evidence-backed strength 1", "evidence-backed strength 2"],
  "gaps": ["specific gap with evidence", "specific gap with evidence"],
  "jdMatchedSkills": ["confirmed skill 1", "confirmed skill 2"],
  "jdMissingSkills": ["missing skill 1", "missing skill 2"],
  "resumeJDFitScore": <0-100>,
  "resumeEvaluationNotes": "Detailed paragraph evaluating resume vs JD...",
  "resumeCredibility": "HIGH|MEDIUM|LOW",
  "resumeCredibilityReason": "Specific explanation of consistency or red flags",
  "behavioralProfile": "Summary of soft skills and communication style...",
  "copiedCodeDetected": <true/false>,
  "aiSummary": "3-4 sentence executive summary with recommendation",
  "keyMoments": [
    {"type": "strength", "questionTopic": "React Hooks", "evidence": "candidate explained useEffect perfectly and caught an edge case"}
  ],
  "hiringRisk": "LOW|MEDIUM|HIGH",
  "hiringRiskReason": "specific justification for the assigned hiring risk",
  "onboardingRecommendations": ["specific suggestion 1", "specific suggestion 2"]
}`
}