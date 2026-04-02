import axios from 'axios'

const URL = process.env.PISTON_API_URL || 'http://localhost:2000'

// Simple concurrency limiter
async function asyncPool(poolLimit: number, array: any[], iteratorFn: (item: any, i: number) => Promise<any>) {
  const ret = [];
  const executing: Promise<any>[] = [];
  for (let i = 0; i < array.length; i++) {
    const item = array[i];
    const p = Promise.resolve().then(() => iteratorFn(item, i));
    ret.push(p);
    if (poolLimit <= array.length) {
      const e: Promise<any> = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

export async function runTestCases(params: {
  sourceCode: string, language: string, testCases: any[]
}) {
  // ── FIX: Run test cases with concurrency = 2 instead of all at once
  const results = await asyncPool(2, params.testCases, async (tc, i) => {
    try {
      // Use the custom HF format revealed in Postman: { language, code }
      const { data } = await axios.post(`${URL}/execute`, {
        language: params.language.toLowerCase(),
        code: params.sourceCode,
        input: tc.input || ''
      }, { timeout: 25000 }) // Increase timeout to 25s for slow languages like Python/Java
      
      const actual = String(data.output || '').trim()
      const expected = String(tc.expectedOutput || '').trim()
      
      return {
        caseIndex: i,
        passed: actual === expected,
        actualOutput: actual,
        expectedOutput: expected,
        input: tc.input,
        isHidden: tc.isHidden
      }
    } catch (err: any) {
      console.error(`Execution failed for Case ${i}:`, err.message)
      return {
        caseIndex: i,
        passed: false,
        actualOutput: `Error: ${err.message}`,
        expectedOutput: String(tc.expectedOutput || '').trim(),
        input: tc.input,
        isHidden: tc.isHidden
      }
    }
  })

  const passedCount = results.filter((r: any) => r.passed).length
  return { results, passed: passedCount, total: results.length }
}