import { prisma } from '../../lib/prisma'
import { drawQuestions } from '../../utils/question-draw.util'
import { calculateMCQScore, calculateCodingScore, calculatePassFail, calculateDeliveryMetrics } from '../../utils/score.util'
import { runTestCases } from '../ai/judge0.service'
import {
  evaluateInterviewAnswer,
  evaluateCodeExplanation,
  generateInterviewPrompts,
  transcribeAudio,
} from '../ai/ai.service'
import type {
  StartAttemptInput, SubmitMCQInput,
  SubmitCodingInput, SubmitInterviewInput,
  SubmitLiveCodingInput,
} from './attempt.dto'
import { createSession } from '../proctoring/proctoring.service'

// ── FIX 4: startAttempt — correct pool + resume personalisation ─
export async function startAttempt(candidateId: string, input: StartAttemptInput) {
  const candidate = await prisma.candidateProfile.findUniqueOrThrow({
    where: { id: candidateId },
    include: { campaign: { include: { rounds: true } } },
  })

  if (!['READY', 'IN_PROGRESS'].includes(candidate.status)) {
    throw { status: 400, message: 'Candidate is not ready to start assessment' }
  }

  const existing = await prisma.candidateAttempt.findFirst({
    where: { candidateId, roundId: input.roundId, status: { in: ['IN_PROGRESS', 'COMPLETED', 'TIMED_OUT'] } },
  })

  if (existing) {
    if (existing.status === 'COMPLETED' || existing.status === 'TIMED_OUT') {
      throw { status: 409, message: 'Attempt already completed or timed out for this round.', code: 'ALREADY_COMPLETED' }
    }
    // If IN_PROGRESS, allow re-entry
    return getAttemptQuestions(existing.id)
  }

  // FIX 4: include pool + questions
  const round = await prisma.pipelineRound.findUniqueOrThrow({
    where: { id: input.roundId },
    include: {
      questionPool: {
        include: { questions: { where: { isActive: true } } },
      },
    },
  })

  if (!round.questionPool || round.questionPool.status !== 'READY') {
    throw { status: 400, message: 'Question pool is not ready yet.' }
  }

  const roundConfig = round.roundConfig as any
  const isInterview = round.roundType === 'INTERVIEW'
  const isLiveCoding = roundConfig.interviewMode === 'TEXT_LIVE_CODING' || roundConfig.interviewMode === 'AUDIO_LIVE_CODING'
  const resumeSplit = roundConfig.resumeSplit || 0

  // ── RESUME PERSONALISATION: re-generate questions per candidate ──
  // Only for interview rounds where admin configured resumeSplit > 0
  let poolQuestions = round.questionPool.questions

  if (isInterview && resumeSplit > 0 && candidate.resumeText) {
    try {
      const personalised = await generateInterviewPrompts(
        candidate.campaign.jobDescription,
        candidate.campaign.role,
        roundConfig,
        candidate.resumeText
      )

      // Create temporary questions just for this candidate — stored in a
      // candidate-specific pool override (we reuse the pool table with a flag)
      const questionCount = roundConfig.questionCount || 5
      // Use AI-generated personalised questions instead of pool
      // They are ephemeral — created now, assigned to this attempt
      const createdQuestions = await prisma.$transaction(
        personalised.slice(0, Math.ceil(questionCount * 1.5)).map((q: any) =>
          prisma.question.create({
            data: {
              poolId: round.questionPool!.id,
              type: 'INTERVIEW_PROMPT',
              difficulty: q.difficulty || 'MEDIUM',
              topicTag: q.topicTag,
              order: 999, // high order = candidate-personalised
              prompt: q.prompt,
              evaluationRubric: q.evaluationRubric,
              followUpPrompts: q.followUpPrompts,
              // LIVE_CODING fields
              liveCodingProblem: q.liveCodingProblem,
              liveCodingTestCases: q.liveCodingTestCases,
              liveCodingStarter: q.liveCodingStarter,
              explanationPrompt: q.explanationPrompt,
              explanationRubric: q.explanationRubric,
              marksAwarded: q.marksAwarded || 1,
            },
          })
        )
      )
      poolQuestions = createdQuestions
    } catch (err) {
      // Fall back to base pool if personalisation fails
      console.warn('[Attempt] Resume personalisation failed, using base pool:', err)
    }
  }

  if (poolQuestions.length === 0) {
    throw { status: 400, message: 'No questions available. Ask admin to regenerate the pool.' }
  }

  const questionCount = roundConfig.totalQuestions || roundConfig.problemCount || roundConfig.questionCount || 10
  const drawnQuestions = drawQuestions(poolQuestions, questionCount, roundConfig)
  const proctoring = (candidate.campaign.pipelineConfig as any)?.proctoring || {}

  // Calculate cumulative strike count
  const currentStrikes = await prisma.strikeEvent.count({
    where: { candidateId, isStrike: true }
  })

  // If already at or over limit, don't allow starting new round (redundant guard)
  if (currentStrikes >= (proctoring.maxStrikes || 10)) {
    throw { status: 403, message: 'Assessment terminated due to proctoring violations.', code: 'TERMINATED' }
  }

  const attempt = await prisma.candidateAttempt.create({
    data: {
      candidateId,
      roundId: input.roundId,
      campaignId: candidate.campaignId,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      timeLimitMinutes: round.timeLimitMinutes,
      maxStrikes: proctoring.maxStrikes || 10,
      strikeCount: currentStrikes,
      assignedQuestionIds: drawnQuestions.map((q: any) => q.id),
    },
  })

  await prisma.attemptRecording.create({
    data: { attemptId: attempt.id, recordingStartedAt: new Date() },
  }).catch(() => { })

  if (candidate.status === 'READY') {
    await prisma.candidateProfile.update({
      where: { id: candidateId },
      data: { status: 'IN_PROGRESS' },
    })
  }

  // Strip sensitive fields
  const safeQuestions = drawnQuestions.map((q: any) => ({
    id: q.id,
    type: q.type,
    difficulty: q.difficulty,
    topicTag: q.topicTag,
    // MCQ
    stem: q.stem,
    options: q.options?.map((o: any) => ({ id: o.id, text: o.text })),
    // Coding
    problemTitle: q.problemTitle,
    problemStatement: q.problemStatement,
    constraints: q.constraints,
    examples: q.examples,
    starterCode: q.starterCode,
    // Interview
    prompt: q.prompt,
    // LIVE_CODING (send problem but not hidden rubric)
    liveCodingProblem: q.liveCodingProblem,
    liveCodingTestCases: (q.liveCodingTestCases as any[])?.filter((tc: any) => !tc.isHidden),
    liveCodingStarter: q.liveCodingStarter,
    explanationPrompt: q.explanationPrompt,
    marksAwarded: q.marksAwarded,
    // Metadata
    interviewMode: roundConfig.interviewMode,
  }))


  const session = await createSession(candidateId)

  return {
    attempt,
    questions: safeQuestions,
    interviewMode: roundConfig.interviewMode,
    sessionId: session.id,
    faceDescriptor: (candidate as any).faceDescriptor
  }
}

// ── Time enforcement ──────────────────────────────────────────
async function enforceTimeLimit(attemptId: string): Promise<void> {
  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { startedAt: true, timeLimitMinutes: true, status: true },
  })
  if (!attempt.timeLimitMinutes || !attempt.startedAt) return
  if (attempt.status !== 'IN_PROGRESS') return
  const elapsed = (Date.now() - new Date(attempt.startedAt).getTime()) / 60000
  if (elapsed > attempt.timeLimitMinutes + 1) {
    await prisma.candidateAttempt.update({
      where: { id: attemptId },
      data: { status: 'TIMED_OUT', completedAt: new Date() },
    })
    throw { status: 403, message: 'Time limit exceeded.', code: 'TIMED_OUT' }
  }
}

// ── Submit MCQ ────────────────────────────────────────────────
export async function submitMCQAnswer(input: SubmitMCQInput) {
  await enforceTimeLimit(input.attemptId)

  const question = await prisma.question.findUniqueOrThrow({
    where: { id: input.questionId },
    select: { options: true, marksAwarded: true },
  })

  const options = question.options as any[]
  const correct = options.find((o) => o.isCorrect)
  const isCorrect = correct?.id === input.selectedOptionId

  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({ where: { id: input.attemptId } })
  const roundCfg = await prisma.pipelineRound.findUnique({ where: { id: attempt.roundId }, select: { roundConfig: true } })
  const cfg = (roundCfg?.roundConfig as any) || {}

  const marksAwarded = calculateMCQScore({
    isCorrect, attempted: !!input.selectedOptionId,
    marksPerQuestion: question.marksAwarded,
    negativeMarking: cfg.negativeMarking || false,
    penaltyPerWrong: cfg.penaltyPerWrong || 0,
  })

  return prisma.mCQAnswer.upsert({
    where: { attemptId_questionId: { attemptId: input.attemptId, questionId: input.questionId } },
    update: { selectedOptionId: input.selectedOptionId, isCorrect, marksAwarded, timeTakenSeconds: input.timeTakenSeconds },
    create: { attemptId: input.attemptId, questionId: input.questionId, selectedOptionId: input.selectedOptionId, isCorrect, marksAwarded, timeTakenSeconds: input.timeTakenSeconds },
  })
}

// ── Submit Coding ─────────────────────────────────────────────
export async function submitCodingAnswer(input: SubmitCodingInput) {
  await enforceTimeLimit(input.attemptId)

  const question = await prisma.question.findUniqueOrThrow({
    where: { id: input.questionId },
    select: { testCases: true, solutionCode: true },
  })

  const submission = await prisma.codingSubmission.create({
    data: { attemptId: input.attemptId, questionId: input.questionId, language: input.language, sourceCode: input.sourceCode, keystrokeMetrics: input.keystrokeMetrics, statusDesc: 'PENDING' },
  })

  const wrapper = (question.solutionCode as any)?.[input.language] || ''
  const executableCode = input.sourceCode + '\n' + wrapper
  
  runTestCasesWithRetry(submission.id, { ...input, sourceCode: executableCode }, question.testCases as any[])

  return { ...submission, message: 'Submission received. Test cases running.' }
}

async function runTestCasesWithRetry(submissionId: string, input: SubmitCodingInput, testCases: any[], attempt = 1) {
  try {
    const results = await runTestCases({ sourceCode: input.sourceCode, language: input.language, testCases })
    const marks = calculateCodingScore(results.passed, results.total)
    await prisma.codingSubmission.update({
      where: { id: submissionId },
      data: { testCaseResults: results.results, testCasesPassed: results.passed, testCasesTotal: results.total, marksAwarded: marks, statusDesc: results.passed === results.total ? 'Accepted' : 'Partial' },
    })
  } catch {
    if (attempt < 3) setTimeout(() => runTestCasesWithRetry(submissionId, input, testCases, attempt + 1), attempt * 3000)
    else await prisma.codingSubmission.update({ where: { id: submissionId }, data: { statusDesc: 'JUDGE0_ERROR' } })
  }
}

export async function runCodingTestCases(input: SubmitCodingInput) {
  await enforceTimeLimit(input.attemptId)
  const question = await prisma.question.findUniqueOrThrow({
    where: { id: input.questionId },
    select: { testCases: true, solutionCode: true },
  })
  const wrapper = (question.solutionCode as any)?.[input.language] || ''
  const executableCode = input.sourceCode + '\n' + wrapper
  const allResults = await runTestCases({ sourceCode: executableCode, language: input.language, testCases: question.testCases as any[] })
  
  // ── FIX: Hide hidden test case actual outputs from the frontend /run API
  const safeResults = allResults.results.map((r: any) => {
    if (r.isHidden) {
      return {
        ...r,
        actualOutput: 'Hidden test case executed',
        expectedOutput: 'Hidden'
      }
    }
    return r
  })
  
  return { ...allResults, results: safeResults }
}

// ── Submit Interview (TEXT / AUDIO) ───────────────────────────
export async function submitInterviewAnswer(
  input: SubmitInterviewInput,
  audioBuffer?: Buffer,  // optional raw audio from multipart upload
) {
  await enforceTimeLimit(input.attemptId)

  const question = await prisma.question.findUniqueOrThrow({
    where: { id: input.questionId },
    select: { prompt: true, evaluationRubric: true, topicTag: true, followUpPrompts: true },
  })

  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({
    where: { id: input.attemptId },
    include: {
      round: { select: { roundConfig: true } },
      candidate: { include: { campaign: { select: { role: true } } } }
    },
  })

  // Transcribe audio if AUDIO mode and buffer provided
  let sttTranscript = input.sttTranscript || ''
  if (audioBuffer && audioBuffer.length > 0 && !sttTranscript) {
    try {
      const result = await transcribeAudio(audioBuffer)
      sttTranscript = result.text
    } catch (err) {
      console.warn('[InterviewAnswer] Whisper transcription failed:', err)
    }
  }

  const answerText = input.textAnswer || sttTranscript || ''
  const askedPrompt = input.askedPrompt?.trim()
  const promptForEvaluation = askedPrompt || question.prompt || ''

  // Recalculate delivery metrics if we have a transcript + duration
  let metrics = {
    deliveryScore: input.deliveryScore,
    durationSeconds: input.durationSeconds ?? 0,
    speechDuration: input.speechDuration,
    silenceRatio: input.silenceRatio,
    wordsPerMinute: input.wordsPerMinute,
    wordCount: input.wordCount,
    fillerWordCount: input.fillerWordCount,
    fillerWordRatio: input.fillerWordRatio
  }

  if (input.mode === 'AUDIO' && sttTranscript && input.durationSeconds) {
    const calc = calculateDeliveryMetrics(sttTranscript, input.durationSeconds)
    metrics = {
      ...metrics,
      deliveryScore: metrics.deliveryScore ?? calc.deliveryScore,
      speechDuration: metrics.speechDuration ?? calc.speechDuration,
      silenceRatio: metrics.silenceRatio ?? calc.silenceRatio,
      wordsPerMinute: metrics.wordsPerMinute ?? calc.wordsPerMinute,
      wordCount: metrics.wordCount ?? calc.wordCount,
      fillerWordCount: metrics.fillerWordCount ?? calc.fillerWordCount,
      fillerWordRatio: metrics.fillerWordRatio ?? calc.fillerWordRatio,
    }
  }

  // Extract category from topicTag
  const topicTag = question.topicTag || ''
  const category = topicTag.startsWith('resume:') ? 'RESUME_DRILL'
    : (question.followUpPrompts as any[])?.[0]?.category || undefined

  const evaluation = await evaluateInterviewAnswer({
    prompt: promptForEvaluation,
    answer: answerText,
    rubric: question.evaluationRubric!,
    role: attempt.candidate.campaign.role,
    category,
    topicTag,
    depth: (attempt as any).round?.roundConfig?.depth || 'DEEP',
  })

  // Only ask a follow-up for a primary question response, not for a follow-up response.
  const generatedFollowUp = !askedPrompt && evaluation.followUp?.trim()
    ? evaluation.followUp.trim()
    : undefined

  // Combine content score (AI) + delivery score (frontend computed)
  // Content = 75% weight, Delivery = 25% weight for AUDIO mode
  const contentScore = evaluation.score
  const deliveryScore = metrics.deliveryScore ?? null
  const finalScore = deliveryScore !== null
    ? (contentScore * 0.75) + (deliveryScore * 0.25)
    : contentScore

  const answer = await prisma.interviewAnswer.create({
    data: {
      attemptId: input.attemptId,
      questionId: input.questionId,
      mode: input.textAnswer ? 'TEXT' : 'AUDIO',
      textAnswer: input.textAnswer,
      audioUrl: input.audioUrl,
      sttTranscript: sttTranscript || input.sttTranscript,
      aiScore: finalScore,
      aiReasoning: deliveryScore !== null
        ? `Content: ${contentScore.toFixed(1)}/10 | Delivery: ${deliveryScore.toFixed(1)}/10 | Combined: ${finalScore.toFixed(1)}/10\n\n${evaluation.reasoning}`
        : evaluation.reasoning,
      aiFollowUpAsked: generatedFollowUp,
      timeTakenSeconds: input.timeTakenSeconds,
      // Delivery metrics
      durationSeconds: metrics.durationSeconds,
      speechDuration: metrics.speechDuration,
      silenceRatio: metrics.silenceRatio,
      wordsPerMinute: metrics.wordsPerMinute,
      wordCount: metrics.wordCount,
      fillerWordCount: metrics.fillerWordCount,
      fillerWordRatio: metrics.fillerWordRatio,
      deliveryScore: deliveryScore,
      // Analysis breakdown
      correctnessScore: evaluation.correctness,
      communicationScore: evaluation.communication,
      confidenceScore: evaluation.confidence,
    },
  })

  return {
    ...answer,
    followUp: generatedFollowUp || null,
  }
}

// ── Submit LIVE_CODING — Phase 1: submit code ─────────────────
// Called when candidate clicks "Submit Code" in the code editor
export async function submitLiveCodingCode(input: SubmitLiveCodingInput) {
  await enforceTimeLimit(input.attemptId)

  const question = await prisma.question.findUniqueOrThrow({
    where: { id: input.questionId },
    select: { liveCodingTestCases: true, explanationPrompt: true, liveCodingProblem: true, solutionCode: true },
  })

  // Run code through Judge0
  const testCases = (question.liveCodingTestCases as any[]) || []
  let codeScore = 0
  let testResults: any = null

  if (testCases.length > 0) {
    try {
      const wrapper = (question.solutionCode as any)?.[input.language] || ''
      const executableCode = input.sourceCode + '\n' + wrapper
      const results = await runTestCases({ sourceCode: executableCode, language: input.language, testCases })
      codeScore = calculateCodingScore(results.passed, results.total) // 0–10
      testResults = results
    } catch {
      codeScore = 0
    }
  }

  // Create InterviewAnswer record with code — explanation comes in Phase 2
  // Determine the stored mode based on round config
  const liveCodingRoundCfg = await prisma.pipelineRound.findFirst({
    where: { attempts: { some: { id: input.attemptId } } },
    select: { roundConfig: true },
  })
  const liveCodingMode = (liveCodingRoundCfg?.roundConfig as any)?.interviewMode || 'TEXT_LIVE_CODING'

  const answer = await prisma.interviewAnswer.create({
    data: {
      attemptId: input.attemptId,
      questionId: input.questionId,
      mode: liveCodingMode as any,
      codeSubmission: input.sourceCode,
      codeLanguage: input.language,
      codeScore,
      // aiScore stays null until explanation is submitted
    },
  })

  return {
    answerId: answer.id,
    codeScore,
    testResults,
    explanationPrompt: question.explanationPrompt || 'Now walk me through your solution. Explain your approach, the time and space complexity, and any trade-offs you considered.',
  }
}

// ── Submit LIVE_CODING — Phase 2: submit audio explanation ────
// Called after candidate records their explanation
export async function submitLiveCodingExplanation(input: {
  attemptId: string
  answerId: string
  questionId: string
  askedPrompt?: string
  sttTranscript?: string
  audioBuffer: Buffer  // raw audio from MediaRecorder
}) {
  await enforceTimeLimit(input.attemptId)

  // Get the existing answer with code
  const existing = await prisma.interviewAnswer.findUniqueOrThrow({
    where: { id: input.answerId },
  })

  const question = await prisma.question.findUniqueOrThrow({
    where: { id: input.questionId },
    select: { liveCodingProblem: true, explanationRubric: true },
  })

  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({
    where: { id: input.attemptId },
    include: {
      round: { select: { roundConfig: true } },
      candidate: { include: { campaign: { select: { role: true } } } }
    },
  })

  const depth = (attempt.round.roundConfig as any)?.depth || 'DEEP'

  // Step 1: Use verified transcript if available, else transcribe audio via Whisper
  let transcript = input.sttTranscript?.trim() || ''
  if (!transcript) {
    const result = await transcribeAudio(input.audioBuffer)
    transcript = result.text
  }

  // Step 2: AI evaluates explanation against actual code
  const evaluation = await evaluateCodeExplanation({
    problem: question.liveCodingProblem || '',
    code: existing.codeSubmission || '',
    language: existing.codeLanguage || 'unknown',
    transcript,
    rubric: question.explanationRubric || '',
    role: attempt.candidate.campaign.role,
    depth,
  })

  // Step 3: Combine scores — 60% code, 40% explanation
  const codeScore = existing.codeScore || 0
  const explainScore = evaluation.score
  const finalScore = (codeScore * 0.6) + (explainScore * 0.4)
  const generatedFollowUp = !input.askedPrompt?.trim() && evaluation.followUp?.trim()
    ? evaluation.followUp.trim()
    : undefined

  // Update the answer record
  await prisma.interviewAnswer.update({
    where: { id: input.answerId },
    data: {
      explainTranscript: transcript,
      explainScore: explainScore,
      aiScore: finalScore,
      aiReasoning: `Code: ${codeScore}/10 (Judge0 test cases) | Explanation: ${explainScore}/10 (AI evaluation) | Combined: ${finalScore.toFixed(1)}/10\n\n${evaluation.reasoning}`,
      aiFollowUpAsked: generatedFollowUp,
    },
  })

  return {
    codeScore,
    explainScore,
    finalScore,
    copiedCodeSignal: evaluation.copiedCodeSignal,
    reasoning: evaluation.reasoning,
    transcript,
    followUp: generatedFollowUp || null,
  }
}

// ── Submit Interview (any mode) ───────────────────────────────
// Single endpoint the controller calls — routes by mode
export async function submitInterviewOrLiveCoding(input: any) {
  if (input.mode === 'LIVE_CODING_CODE') {
    return submitLiveCodingCode(input)
  }
  if (input.mode === 'LIVE_CODING_EXPLAIN') {
    return submitLiveCodingExplanation(input)
  }
  return submitInterviewAnswer(input)
}

// ── Complete attempt — auto-advance on PASS, auto-reject on FAIL
export async function completeAttempt(attemptId: string, candidateId: string) {
  // ── FIX: Wait for pending Judge0 submissions before scoring (up to 15s)
  let pendingCount = -1
  for (let i = 0; i < 15; i++) {
    pendingCount = await prisma.codingSubmission.count({
      where: { attemptId, statusDesc: 'PENDING' }
    })
    if (pendingCount === 0) break
    await new Promise(res => setTimeout(res, 1000)) // poll every 1s
  }
  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { mcqAnswers: true, codingSubmissions: true, interviewAnswers: true },
  })

  const round = await prisma.pipelineRound.findUnique({
    where: { id: attempt.roundId },
    select: { roundConfig: true, passMarkPercent: true, roundType: true, failAction: true },
  })
  const cfg = (round?.roundConfig as any) || {}

  let mcqMax = 0
  let codingMax = 0
  let interviewMax = 0
  const numAssigned = (attempt.assignedQuestionIds || []).length

  if (round?.roundType === 'MCQ') {
    mcqMax = numAssigned * (cfg.marksPerQuestion || 1)
  } else if (round?.roundType === 'CODING') {
    codingMax = numAssigned * 10
  } else if (round?.roundType === 'INTERVIEW') {
    // interviewTotal normalizes aiScore / 10, so max per question is 1
    interviewMax = numAssigned
  }

  const mcqTotal = attempt.mcqAnswers.reduce((s, a) => s + (a.marksAwarded || 0), 0)
  
  // Only count the latest submission per question for total
  const latestSubs: Record<string, any> = {}
  attempt.codingSubmissions.forEach(s => {
    if (!latestSubs[s.questionId] || s.submittedAt > latestSubs[s.questionId].submittedAt) {
      latestSubs[s.questionId] = s
    }
  })
  const codingTotal = Object.values(latestSubs).reduce((s, a: any) => s + (a.marksAwarded || 0), 0)
  const interviewTotal = attempt.interviewAnswers.reduce((s, a) => s + ((a.aiScore || 0) / 10), 0)

  const rawScore = mcqTotal + codingTotal + interviewTotal
  const maxScore = Math.max(1, mcqMax + codingMax + interviewMax)
  const pctScore = (rawScore / maxScore) * 100

  const passMark = round?.passMarkPercent ?? 60
  const passed = calculatePassFail(rawScore, maxScore, passMark)

  // Save attempt result
  await prisma.candidateAttempt.update({
    where: { id: attemptId },
    data: { status: 'COMPLETED', completedAt: new Date(), rawScore, maxScore, percentScore: pctScore, passed },
  })

  // Auto-advance or auto-reject based on pass/fail
  const failAction = round?.failAction || cfg.failAction || 'MANUAL_REVIEW'
  const candidate = await prisma.candidateProfile.findUniqueOrThrow({
    where: { id: candidateId }, select: { campaignId: true },
  })

  const { handleRoundCompletion } = await import('./round-advancement.service')
  const advancement = await handleRoundCompletion({
    candidateId,
    campaignId: candidate.campaignId,
    roundId: attempt.roundId,
    passed,
    percentScore: pctScore,
    failAction,
  })

  return {
    ok: true,
    score: rawScore,
    percentScore: pctScore,
    passed,
    advancement, // contains outcome, reason, nextAction, nextRound (if advancing)
  }
}

export async function getAttemptQuestions(attemptId: string) {
  const attempt = await prisma.candidateAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { round: { select: { roundConfig: true } } }
  })
  const roundConfig = (attempt.round.roundConfig as any) || {}

  const questions = await prisma.question.findMany({
    where: { id: { in: attempt.assignedQuestionIds } },
    select: {
      id: true, type: true, difficulty: true, topicTag: true,
      stem: true, options: true,
      problemTitle: true, problemStatement: true, constraints: true, examples: true, starterCode: true,
      prompt: true, marksAwarded: true,
      liveCodingProblem: true, liveCodingTestCases: true, liveCodingStarter: true, explanationPrompt: true,
    },
  })

  const session = await createSession(attempt.candidateId)
  const candidate = await prisma.candidateProfile.findUnique({ where: { id: attempt.candidateId }, select: { faceDescriptor: true } })

  const [mcqAnswers, codingSubmissions, interviewAnswers] = await Promise.all([
    prisma.mCQAnswer.findMany({ where: { attemptId } }),
    prisma.codingSubmission.findMany({
      where: { attemptId },
      orderBy: { submittedAt: 'desc' },
    }),
    prisma.interviewAnswer.findMany({ where: { attemptId } })
  ])

  // Map coding submissions to the latest per question
  const latestCoding: Record<string, any> = {}
  codingSubmissions.forEach(s => {
    if (!latestCoding[s.questionId]) latestCoding[s.questionId] = s
  })

  return {
    attempt,
    interviewMode: roundConfig.interviewMode,
    sessionId: session.id,
    faceDescriptor: candidate?.faceDescriptor,
    mcqAnswers,
    codingSubmissions: latestCoding,
    interviewAnswers,
    questions: questions.map(q => ({
      ...q,
      interviewMode: roundConfig.interviewMode, // important for frontend
      options: (q.options as any[])?.map((o: any) => ({ id: o.id, text: o.text })),
      liveCodingTestCases: (q.liveCodingTestCases as any[])?.filter((tc: any) => !tc.isHidden),
    })),
  }
}

