import { z } from 'zod'

const MCQRoundSchema = z.object({
  order:             z.number(),
  roundType:         z.literal('MCQ'),
  timeLimitMinutes:  z.number().optional(),
  passMarkPercent:   z.number().min(0).max(100).optional(),
  failAction:        z.enum(['AUTO_REJECT', 'MANUAL_REVIEW']).default('MANUAL_REVIEW'),
  totalQuestions:    z.number().optional(),
  shuffleQuestions:  z.boolean().optional(),
  negativeMarking:   z.boolean().optional(),
  penaltyPerWrong:   z.number().optional(),
  marksPerQuestion:  z.number().optional(),
  difficultyEasy:    z.number().min(0).max(100).optional(),
  difficultyMedium:  z.number().min(0).max(100).optional(),
  difficultyHard:    z.number().min(0).max(100).optional(),

  // ── Mode ────────────────────────────────────────────────────
  questionMode:      z.enum(['JD_BASED', 'APTITUDE']).default('JD_BASED'),
  // Used when questionMode = APTITUDE
  // If empty → AI picks a balanced mix automatically
  aptitudeTopics:    z.array(z.string()).optional(),
})

const CodingRoundSchema = z.object({
  order:             z.number(),
  roundType:         z.literal('CODING'),
  timeLimitMinutes:  z.number().optional(),
  passMarkPercent:   z.number().min(0).max(100).optional(),
  failAction:        z.enum(['AUTO_REJECT', 'MANUAL_REVIEW']).default('MANUAL_REVIEW'),
  problemCount:      z.number().optional(),
  allowedLanguages:  z.array(z.string()).optional(),
  difficultyEasy:    z.number().min(0).max(100).optional(),
  difficultyMedium:  z.number().min(0).max(100).optional(),
  difficultyHard:    z.number().min(0).max(100).optional(),

  // ── Mode ────────────────────────────────────────────────────
  questionMode:      z.enum(['JD_BASED', 'DSA']).default('JD_BASED'),
  // Used when questionMode = DSA
  // If empty → AI picks a balanced mix automatically
  dsaTopics:         z.array(z.string()).optional(),
})

const InterviewRoundSchema = z.object({
  order:             z.number(),
  roundType:         z.literal('INTERVIEW'),
  timeLimitMinutes:  z.number().optional(),
  passMarkPercent:   z.number().min(0).max(100).optional(),
  failAction:        z.enum(['AUTO_REJECT', 'MANUAL_REVIEW']).default('MANUAL_REVIEW'),

  // TEXT              = candidate types answer
  // AUDIO             = candidate speaks answer (TTS question + Whisper STT)
  // TEXT_LIVE_CODING  = candidate types answers + live coding + text explanation
  // AUDIO_LIVE_CODING = candidate speaks answers + live coding + audio explanation
  interviewMode:     z.enum(['TEXT', 'AUDIO', 'TEXT_LIVE_CODING', 'AUDIO_LIVE_CODING']).default('TEXT'),

  questionCount:     z.number().optional(),
  depth:             z.enum(['SHALLOW', 'DEEP']).optional(),
  followUpEnabled:   z.boolean().optional(),
  allowedLanguages:  z.array(z.string()).optional(), // for LIVE_CODING mode

  // Resume personalisation — % of questions sourced from candidate resume
  // 0 = all JD-based (default), 30 = 30% resume + 70% JD, 100 = all resume
  resumeSplit:       z.number().min(0).max(100).default(0),
})

const MixedRoundSchema = z.object({
  order:             z.number(),
  roundType:         z.literal('MIXED'),
  timeLimitMinutes:  z.number().optional(),
  timerMode:         z.enum(['SHARED', 'PER_SLICE']).optional(),
  passMarkPercent:   z.number().min(0).max(100).optional(),
  failAction:        z.enum(['AUTO_REJECT', 'MANUAL_REVIEW']).default('MANUAL_REVIEW'),
  slices:            z.array(z.any()).optional(),
})

const RoundConfigSchema = z.discriminatedUnion('roundType', [
  MCQRoundSchema,
  CodingRoundSchema,
  InterviewRoundSchema,
  MixedRoundSchema,
])

export const CreateCampaignDto = z.object({
  name:           z.string().min(2),
  role:           z.string().min(2),
  department:     z.string().optional(),
  jobDescription: z.string().min(50, 'JD must be at least 50 characters'),
  hiringType:     z.enum(['CAMPUS', 'LATERAL']).optional(),
  expiresAt:      z.string().optional().nullable(),
  maxCandidates:  z.number().optional(),
  pipelineConfig: z.object({
    timerMode:  z.enum(['SHARED', 'PER_SLICE']).default('PER_SLICE'),
    rounds:     z.array(RoundConfigSchema).min(1),
    proctoring: z.object({
      maxStrikes:            z.number().min(1).max(10).default(3),
      violations: z.object({
        PHONE_DETECTED:      z.union([z.literal('STRIKE'), z.literal('FLAG'), z.literal(false)]).default('STRIKE'),
        FACE_AWAY:           z.union([z.literal('STRIKE'), z.literal('FLAG'), z.literal(false)]).default('STRIKE'),
        MULTIPLE_FACES:      z.union([z.literal('STRIKE'), z.literal('FLAG'), z.literal(false)]).default('STRIKE'),
        TAB_SWITCH:          z.union([z.literal('STRIKE'), z.literal('FLAG'), z.literal(false)]).default('STRIKE'),
        FOCUS_LOSS:          z.union([z.literal('STRIKE'), z.literal('FLAG'), z.literal(false)]).default('STRIKE'),
        BACKGROUND_VOICE:    z.union([z.literal('STRIKE'), z.literal('FLAG'), z.literal(false)]).default('FLAG'),
      }).default({}),
    }).optional(),
  }),
})

export const UpdateCampaignStatusDto = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED', 'ARCHIVED']),
})

export type CreateCampaignInput       = z.infer<typeof CreateCampaignDto>
export type UpdateCampaignStatusInput = z.infer<typeof UpdateCampaignStatusDto>