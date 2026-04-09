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

type Judge0SmokeProgram = {
  name: string
  language: string
  sourceCode: string
  stdin: string
  expectedOutput: string
}

type Judge0SmokeProgramResult = {
  name: string
  language: string
  passed: boolean
  expectedOutput: string
  actualOutput: string
  statusId?: number
  statusDesc?: string
}

export type Judge0SmokeResult = {
  ok: boolean
  baseUrl: string
  ping: {
    ok: boolean
    latencyMs: number
    languageCount?: number
    message?: string
  }
  programs: Judge0SmokeProgramResult[]
  summary: {
    passed: number
    total: number
  }
  checkedAt: string
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

async function pingJudge0(): Promise<{ ok: boolean; latencyMs: number; languageCount?: number; message?: string }> {
  const headers: Record<string, string> = {}
  if (API_KEY) headers['X-Auth-Token'] = API_KEY

  const startedAt = Date.now()
  try {
    const { data } = await axios.get<any[]>(`${URL}/languages`, {
      timeout: 5000,
      headers,
    })
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      languageCount: Array.isArray(data) ? data.length : undefined,
    }
  } catch (err: any) {
    const message = err?.response?.data?.message || err?.message || 'Judge0 ping failed'
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      message,
    }
  }
}

async function runSmokeProgram(program: Judge0SmokeProgram): Promise<Judge0SmokeProgramResult> {
  try {
    const languageId = resolveLanguageId(program.language)
    const data = await executeJudge0(program.sourceCode, languageId, program.stdin)
    const actualOutput = normalizeOutput(data)
    const expectedOutput = program.expectedOutput.trim()

    return {
      name: program.name,
      language: program.language,
      passed: actualOutput === expectedOutput,
      expectedOutput,
      actualOutput,
      statusId: data.status?.id,
      statusDesc: data.status?.description,
    }
  } catch (err: any) {
    const message = err?.response?.data?.message || err?.message || 'Program execution failed'
    return {
      name: program.name,
      language: program.language,
      passed: false,
      expectedOutput: program.expectedOutput.trim(),
      actualOutput: `Error: ${message}`,
    }
  }
}

export async function runJudge0SmokeTest(): Promise<Judge0SmokeResult> {
  const ping = await pingJudge0()

  const programs: Judge0SmokeProgram[] = [
    {
      name: 'JavaScript sum',
      language: 'javascript',
      sourceCode: "const fs=require('fs');const i=fs.readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);console.log((i[0]||0)+(i[1]||0));",
      stdin: '2 3',
      expectedOutput: '5',
    },
    {
      name: 'Java multiply',
      language: 'java',
      sourceCode: 'import java.util.*; class Main { public static void main(String[] args){ Scanner sc=new Scanner(System.in); int a=sc.nextInt(); int b=sc.nextInt(); System.out.println(a*b); } }',
      stdin: '4 6',
      expectedOutput: '24',
    },
    {
      name: 'Python reverse',
      language: 'python',
      sourceCode: 's=input().strip()\nprint(s[::-1])',
      stdin: 'judge0',
      expectedOutput: '0egduj',
    },
    {
      name: 'C loop',
      language: 'c',
      sourceCode: '#include <stdio.h>\nint main(){int n;scanf("%d", &n);int s=0;for(int i=1;i<=n;i++) s+=i;printf("%d\\n", s);return 0;}',
      stdin: '5',
      expectedOutput: '15',
    },
    {
      name: 'C++ max',
      language: 'cpp',
      sourceCode: '#include <iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<(a>b?a:b)<<"\\n";return 0;}',
      stdin: '9 4',
      expectedOutput: '9',
    },
  ]

  const results = await Promise.all(programs.map(runSmokeProgram))
  const passedCount = results.filter((r) => r.passed).length

  return {
    ok: ping.ok && passedCount === results.length,
    baseUrl: URL,
    ping,
    programs: results,
    summary: {
      passed: passedCount,
      total: results.length,
    },
    checkedAt: new Date().toISOString(),
  }
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