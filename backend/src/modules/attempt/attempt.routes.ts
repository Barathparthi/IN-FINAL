import { Router } from 'express'
import { authenticate, requireRole } from '../../middlewares/auth.middleware'
import * as AttemptController from './attempt.controller'

export const attemptRouter = Router()

attemptRouter.use(authenticate)
attemptRouter.use(requireRole('CANDIDATE'))

attemptRouter.post('/start', AttemptController.start)
attemptRouter.get('/:attemptId/questions', AttemptController.getQuestions)
attemptRouter.post('/run/coding', AttemptController.runCoding)
attemptRouter.post('/submit/mcq', AttemptController.submitMCQ)
attemptRouter.post('/submit/coding', AttemptController.submitCoding)
attemptRouter.post('/submit/interview', ...AttemptController.submitInterview)
attemptRouter.post('/live-coding/code', AttemptController.submitLiveCodingCode)
attemptRouter.post('/live-coding/explain', ...AttemptController.submitLiveCodingExplain)
attemptRouter.post('/complete', AttemptController.complete)