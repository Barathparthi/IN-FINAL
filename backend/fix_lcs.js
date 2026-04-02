const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const LCS_STARTER = {
  "python": "def solve(s1: str, s2: str) -> int:\n    # Write your implementation here\n    pass",
  "javascript": "/**\n * @param {string} s1\n * @param {string} s2\n * @return {number}\n */\nfunction solve(s1, s2) {\n    // Write your implementation here\n}",
  "java": "public class Main {\n    public static int solve(String s1, String s2) {\n        // implementation\n        return 0;\n    }\n}",
  "cpp": "int solve(string s1, string s2) {\n    // implementation\n    return 0;\n}"
}

const LCS_SOLUTION = {
  "python": "def solve(s1, s2):\n    m, n = len(s1), len(s2)\n    dp = [[0] * (n + 1) for _ in range(m + 1)]\n    for i in range(1, m + 1):\n        for j in range(1, n + 1):\n            if s1[i-1] == s2[j-1]:\n                dp[i][j] = dp[i-1][j-1] + 1\n            else:\n                dp[i][j] = max(dp[i-1][j], dp[i][j-1])\n    return dp[m][n]",
  "javascript": "function solve(s1, s2) {\n    const m = s1.length; const n = s2.length;\n    const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));\n    for (let i = 1; i <= m; i++) {\n        for (let j = 1; j <= n; j++) {\n            if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;\n            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);\n        }\n    }\n    return dp[m][n];\n}"
}

async function run() {
  const q = await prisma.question.findFirst({ 
    where: { OR: [ { problemTitle: { contains: 'LCS' } }, { problemTitle: { contains: 'Longest' } } ] }
  })
  if (q) {
    console.log(`Fixing question: ${q.problemTitle} (${q.id})`)
    await prisma.question.update({
      where: { id: q.id },
      data: { 
        starterCode: LCS_STARTER,
        solutionCode: LCS_SOLUTION
      }
    })
    console.log("Success: Starter code reset and Solution code moved to solutionCode field.")
  } else {
    console.log("Question not found.")
  }
  await prisma.$disconnect()
  process.exit(0)
}
run();
