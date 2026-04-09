import type { Request, Response, NextFunction } from 'express'
import { runJudge0SmokeTest } from './judge0.service'

export async function judge0Smoke(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await runJudge0SmokeTest()
    const statusCode = result.ok ? 200 : 503
    return res.status(statusCode).json(result)
  } catch (err) {
    return next(err)
  }
}
