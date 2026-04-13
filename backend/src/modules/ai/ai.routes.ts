import { Router } from 'express'
import * as C from './ai.controller'

export const aiRouter = Router()

// Public smoke test for Judge0 connectivity and execution.
aiRouter.get('/judge0/smoke', C.judge0Smoke)

// Public run endpoint — execute code directly (for testing / Postman)
aiRouter.post('/judge0/run', C.judge0Run)
