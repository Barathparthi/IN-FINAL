import type { Request, Response, NextFunction } from 'express'
import { runJudge0SmokeTest, runTestCases } from './judge0.service'

export async function judge0Smoke(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await runJudge0SmokeTest()
    const statusCode = result.ok ? 200 : 503
    return res.status(statusCode).json(result)
  } catch (err) {
    return next(err)
  }
}

// POST /api/ai/judge0/run
// Body: { sourceCode, language, stdin?, testCases? }
export async function judge0Run(req: Request, res: Response, next: NextFunction) {
  try {
    const { sourceCode, language, stdin, testCases } = req.body

    if (!sourceCode || !language) {
      return res.status(400).json({ error: 'sourceCode and language are required' })
    }

    // If testCases array is provided, run all of them
    if (Array.isArray(testCases) && testCases.length > 0) {
      const result = await runTestCases({ sourceCode, language, testCases })
      return res.json(result)
    }

    // Otherwise run as a single stdin submission
    const result = await runTestCases({
      sourceCode,
      language,
      testCases: [{ input: stdin ?? '', expectedOutput: '' }],
    })

    const r = result.results[0]
    return res.json({
      stdout:     r.actualOutput,
      statusId:   r.statusId,
      statusDesc: r.statusDesc,
      language,
    })
  } catch (err) {
    return next(err)
  }
}
