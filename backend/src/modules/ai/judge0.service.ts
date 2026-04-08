import axios from 'axios'

const URL = process.env.JUDGE0_API_URL || 'http://localhost:2358'
const API_KEY = process.env.JUDGE0_API_KEY || ''
const JUDGE0_LANGUAGE_MAP: Record<string, number> = {
  javascript: 63,
  node: 63,
  python: 71,
  python3: 71,
  java: 62,
  cpp: 54,
  'c++': 54,
  c: 50,
}

type Judge0SubmissionResponse = {
  stdout?: string | null
  stderr?: string | null
  compile_output?: string | null
  message?: string | null
  status?: {
    id?: number
    description?: string
  }
}

function resolveLanguageId(language: string): number {
  const key = (language || '').trim().toLowerCase()
  const languageId = JUDGE0_LANGUAGE_MAP[key]
  if (!languageId) throw new Error(`Unsupported language for Judge0: ${language}`)
  return languageId
}

function normalizeOutput(data: Judge0SubmissionResponse): string {
  return (data.stdout ?? data.stderr ?? data.compile_output ?? data.message ?? '').trim()
}

async function executeJudge0(sourceCode: string, languageId: number, stdin: string) {
  const headers: Record<string, string> = {}
  if (API_KEY) headers['X-Auth-Token'] = API_KEY
  const { data } = await axios.post<Judge0SubmissionResponse>(
    `${URL}/submissions/?base64_encoded=false&wait=true`,
    {
      source_code: sourceCode,
      language_id: languageId,
      stdin,
    },
    {
      timeout: 30000,
      headers,
    },
  )
  return data
}

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
  const languageId = resolveLanguageId(params.language)
  // ── FIX: Run test cases with concurrency = 2 instead of all at once
  const results = await asyncPool(2, params.testCases, async (tc, i) => {
    try {
      const data = await executeJudge0(params.sourceCode, languageId, tc.input || '')
      const actual = normalizeOutput(data)
      const expected = String(tc.expectedOutput || '').trim()
      
      return {
        caseIndex: i,
        passed: actual === expected,
        actualOutput: actual,
        expectedOutput: expected,
        input: tc.input,
        isHidden: tc.isHidden,
        statusId: data.status?.id,
        statusDesc: data.status?.description,
      }
    } catch (err: any) {
      const message = err?.response?.data?.message || err.message
      console.error(`Judge0 execution failed for Case ${i}:`, message)
      return {
        caseIndex: i,
        passed: false,
        actualOutput: `Error: ${message}`,
        expectedOutput: String(tc.expectedOutput || '').trim(),
        input: tc.input,
        isHidden: tc.isHidden,
      }
    }
  })

  const passedCount = results.filter((r: any) => r.passed).length
  return { results, passed: passedCount, total: results.length }
}