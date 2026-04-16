import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import * as AttemptService from './attempt.service'
import {
  StartAttemptDto, SubmitMCQDto, SubmitCodingDto,
  SubmitInterviewDto, SubmitLiveCodingCodeDto, SubmitLiveCodingExplainDto,
  CompleteAttemptDto,
} from './attempt.dto'

// Multer for audio upload (live coding explanation)
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

export async function start(req: Request, res: Response, next: NextFunction) {
  try {
    const input  = StartAttemptDto.parse(req.body)
    const result = await AttemptService.startAttempt(req.user!.candidateId!, input)
    res.status(201).json(result)
  } catch (err) { next(err) }
}

export async function getQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await AttemptService.getAttemptQuestions(req.params.attemptId))
  } catch (err) { next(err) }
}

export async function submitMCQ(req: Request, res: Response, next: NextFunction) {
  try {
    const input = SubmitMCQDto.parse(req.body)
    res.json(await AttemptService.submitMCQAnswer(input))
  } catch (err) { next(err) }
}

export async function submitCoding(req: Request, res: Response, next: NextFunction) {
  try {
    const input = SubmitCodingDto.parse(req.body)
    res.json(await AttemptService.submitCodingAnswer(input))
  } catch (err) { next(err) }
}

// Submit interview (TEXT or AUDIO)
export const submitInterview = [
  audioUpload.single('audio'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawBody = req.body
      console.log('[SubmitInterview] Received body:', rawBody)
      if (req.file) console.log('[SubmitInterview] Received file:', req.file.originalname, req.file.size)

      // req.body might be encoded as strings in multipart
      const toNum = (val: any) => {
        const n = Number(val)
        return isNaN(n) ? undefined : n
      }

      const parsedData = {
        ...rawBody,
        timeTakenSeconds: toNum(rawBody.timeTakenSeconds) || 0,
        durationSeconds:  toNum(rawBody.durationSeconds),
        speechDuration:   toNum(rawBody.speechDuration),
        silenceRatio:     toNum(rawBody.silenceRatio),
        wordsPerMinute:   toNum(rawBody.wordsPerMinute),
        wordCount:        toNum(rawBody.wordCount),
        fillerWordCount:  toNum(rawBody.fillerWordCount),
        fillerWordRatio:  toNum(rawBody.fillerWordRatio),
        deliveryScore:    toNum(rawBody.deliveryScore),
      }

      const validated = SubmitInterviewDto.safeParse(parsedData)
      if (!validated.success) {
        console.error('[SubmitInterview] Validation failed:', validated.error.format())
        return res.status(400).json({ error: 'Validation failed', detail: validated.error.format() })
      }

      res.json(await AttemptService.submitInterviewAnswer(validated.data, req.file?.buffer))
    } catch (err) { 
      console.error('[SubmitInterview] Runtime error:', err)
      next(err) 
    }
  },
]

// LIVE_CODING Phase 1: candidate submits their code
export async function submitLiveCodingCode(req: Request, res: Response, next: NextFunction) {
  try {
    const input = SubmitLiveCodingCodeDto.parse(req.body)
    res.json(await AttemptService.submitLiveCodingCode(input))
  } catch (err) { next(err) }
}

// LIVE_CODING Phase 2: candidate submits audio explanation
// Receives: multipart/form-data with fields attemptId, answerId, questionId + file 'audio'
export const submitLiveCodingExplain = [
  audioUpload.single('audio'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { attemptId, answerId, questionId, askedPrompt, sttTranscript } = SubmitLiveCodingExplainDto.parse(req.body)

      if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required' })
      }

      const result = await AttemptService.submitLiveCodingExplanation({
        attemptId,
        answerId,
        questionId,
        askedPrompt,
        sttTranscript,
        audioBuffer: req.file.buffer,
      })

      res.json(result)
    } catch (err) { next(err) }
  },
]

export async function runCoding(req: Request, res: Response, next: NextFunction) {
  try {
    const input = SubmitCodingDto.parse(req.body)
    res.json(await AttemptService.runCodingTestCases(input))
  } catch (err) { next(err) }
}

export async function complete(req: Request, res: Response, next: NextFunction) {
  try {
    const { attemptId } = CompleteAttemptDto.parse(req.body)
    res.json(await AttemptService.completeAttempt(attemptId, req.user!.candidateId!))
  } catch (err) { next(err) }
}