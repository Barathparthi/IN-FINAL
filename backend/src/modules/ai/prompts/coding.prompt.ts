// ── DSA Topics ─────────────────────────────────────────────────
export const DSA_TOPICS = {
  arrays_strings: ['Arrays', 'Strings', 'Two Pointers', 'Sliding Window', 'Prefix Sum'],
  linked_list: ['Singly Linked List', 'Doubly Linked List', 'Fast & Slow Pointers', 'Merge Lists', 'Cycle Detection'],
  trees_graphs: ['Binary Tree', 'Binary Search Tree', 'BFS', 'DFS', 'Graph Traversal', 'Topological Sort'],
  dynamic_prog: ['Fibonacci / Memoization', 'Knapsack', 'Longest Common Subsequence', 'Coin Change', 'Matrix DP'],
  sorting_search: ['Binary Search', 'Merge Sort', 'Quick Sort', 'Search in Rotated Array'],
  stack_queue: ['Stack', 'Queue', 'Monotonic Stack', 'Priority Queue / Heap'],
  recursion: ['Backtracking', 'Permutations & Combinations', 'N-Queens', 'Subset Sum'],
  math: ['Prime Numbers', 'GCD / LCM', 'Bit Manipulation', 'Modular Arithmetic'],
}

export type DSATopicKey = keyof typeof DSA_TOPICS

// ── JD-Based Coding Prompt ─────────────────────────────────────
export function codingPrompt(jd: string, role: string, cfg: any): string {
  const total = Math.ceil((cfg.problemCount || 2) * 2.5)
  const langs = (cfg.allowedLanguages || ['javascript', 'python']).join(', ')

  return `You are a LeetCode problem setter creating coding problems for a ${role} role interview.

JOB DESCRIPTION:
${jd}

Generate exactly ${total} coding problems directly relevant to the tech stack in the JD, in authentic LeetCode style.
Difficulty split: ${cfg.difficultyEasy || 0}% Easy, ${cfg.difficultyMedium || 50}% Medium, ${cfg.difficultyHard || 50}% Hard.

RELEVANCE RULES:
- Problems must test real skills from the JD (e.g. if JD mentions React → test component logic / state management; if SQL → test query optimisation; if Node.js → test async patterns / data transformations).

LEETCODE STYLE RULES — every problem must follow all of these:
1. Problem statement in clear prose — describe the engineering scenario first, then the task.
2. **MANDATORY VISUAL DIAGRAM**: For EVERY problem, you MUST include a visual representation. Use Markdown Tables for structured data or Markdown Code Blocks (with ASCII art) for trees, graphs, or flowcharts.
   *Example Table Diagram*:
   | User ID | Login Time | Action |
   | :--- | :--- | :--- |
   | 101 | 09:00 | Login |
   *Example ASCII Diagram*:
   \`\`\`
   (A) ---> (B)
    |        |
    (C) <--- (D)
   \`\`\`
3. Use proper function name relevant to the domain (e.g. findDuplicateOrders, groupUsersByRegion)
4. Examples must label each parameter by name, show exact output, and explain WHY step by step
5. Constraints: input size range, value range, time complexity expectation, any domain constraints
6. Starter code must have JSDoc/@param/@return with domain-relevant parameter names. Use class-based or function-based LeetCode boilerplates.
7. Test cases: EXACTLY 5 test cases total -> 2 visible ('isHidden: false') + 3 hidden edge cases ('isHidden: true') (e.g., empty input, large numbers). Multi-line inputs use \\n.
8. NEVER generate trivial problems — every problem must require algorithmic thinking
9. **CRITICAL: EXECUTION WRAPPER**: For every language provided in starterCode, you MUST provide corresponding \`wrapperCode\`. The wrapper code is appended to the user's code during execution. It must read all inputs from standard input (stdin), parse them according to the test case format, instantiate the class/function, call it, and print the result to stdout.

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "problems": [
    {
      "type": "CODING",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "topicTag": "e.g. Hash Map · Graph Traversal",
      "problemTitle": "Domain-relevant title",
      "problemStatement": "Full prose. Include ASCII/Markdown diagrams if helpful. End with: Return [exact description].",
      "constraints": "- 1 <= logs.length <= 10^5\\n- Expected: O(n log n) time",
      "examples": [
        {
          "input": "logs = [\\"eat\\",\\"tea\\"]",
          "output": "[[\\"eat\\",\\"tea\\"]]",
          "explanation": "Step-by-step reasoning."
        }
      ],
      "testCases": [
        { "input": "[\\"eat\\",\\"tea\\"]", "expectedOutput": "[[\\"eat\\",\\"tea\\"]]", "isHidden": false },
        { "input": "[\\"a\\"]", "expectedOutput": "[[\\"a\\"]]", "isHidden": false },
        { "input": "[\\"\\"]", "expectedOutput": "[[\\"\\"]]", "isHidden": true },
        { "input": "[]", "expectedOutput": "[]", "isHidden": true },
        { "input": "[\\"ab\\",\\"ba\\",\\"abc\\"]", "expectedOutput": "[[\\"ab\\",\\"ba\\"],[\\"abc\\"]]", "isHidden": true }
      ],
      "starterCode": {
        "javascript": "/**\\n * @param {string[]} logs\\n * @return {string[][]}\\n */\\nvar groupAnagramLogs = function(logs) {\\n    \\n};",
        "python": "from typing import List\\nfrom collections import defaultdict\\n\\nclass Solution:\\n    def groupAnagramLogs(self, logs: List[str]) -> List[List[str]]:\\n        ",
        "java": "import java.util.*;\\n\\nclass Solution {\\n    public List<List<String>> groupAnagramLogs(String[] logs) {\\n        \\n    }\\n}",
        "cpp": "class Solution {\\npublic:\\n    vector<vector<string>> groupAnagramLogs(vector<string>& logs) {\\n        \\n    }\\n};"
      },
      "wrapperCode": {
        "javascript": "const fs = require('fs');\\nconst input = fs.readFileSync(0, 'utf-8').trim();\\nconst logs = JSON.parse(input);\\nconsole.log(JSON.stringify(groupAnagramLogs(logs)));",
        "python": "import sys\\nimport json\\n\\nif __name__ == '__main__':\\n    input_data = sys.stdin.read().strip()\\n    logs = json.loads(input_data)\\n    sol = Solution()\\n    res = sol.groupAnagramLogs(logs)\\n    print(json.dumps(res, separators=(',', ':')))"
      }
    }
  ]
}`
}

// ── DSA Coding Prompt ──────────────────────────────────────────
export function dsaPrompt(cfg: any): string {
  const total = Math.ceil((cfg.problemCount || 2) * 2.5)
  const langs = (cfg.allowedLanguages || ['javascript', 'python']).join(', ')
  const hasTopics = cfg.dsaTopics?.length > 0

  let topicInstruction = ''
  if (hasTopics) {
    const selected: string[] = cfg.dsaTopics
    topicInstruction = `
Focus ONLY on these selected DSA topics (distribute problems across them):
${selected.map((t: string) => `- ${t}`).join('\n')}
`
  } else {
    topicInstruction = `
Cover a balanced mix across: Arrays, Strings, Linked Lists, Trees, Dynamic Programming, Sorting & Searching, Stack & Queue.
`
  }

  return `You are a LeetCode problem setter creating high-quality DSA problems for corporate technical interviews.

Generate exactly ${total} problems in authentic LeetCode style.
Difficulty split: ${cfg.difficultyEasy || 0}% Easy, ${cfg.difficultyMedium || 50}% Medium, ${cfg.difficultyHard || 50}% Hard.
${topicInstruction}

DIFFICULTY STANDARDS — follow exactly:
- EASY: requires 1-2 non-trivial steps. NOT single-liners. Examples: Two Sum, Valid Parentheses, Merge Two Sorted Lists. Avoid: find max, sum array, reverse string.
- MEDIUM: requires algorithmic insight. Examples: Longest Substring Without Repeating Characters, Container With Most Water, Number of Islands, Coin Change.
- HARD: requires advanced techniques. Examples: Median of Two Sorted Arrays, Trapping Rain Water, Word Ladder, Edit Distance with constraints.

LEETCODE STYLE RULES — every problem must follow all of these:
1. Problem statement written in clear prose — describe the SCENARIO first, then the task.
2. **MANDATORY VISUAL DIAGRAM**: For EVERY problem, you MUST include a visual representation. Use Markdown Tables or Markdown Code Blocks (with ASCII art).
   *Example Table*:
   | Index | 0 | 1 | 2 |
   | Value | 10 | 20 | 30 |
   *Example Tree*:
   \`\`\`
     [1]
    /   \
   [2]   [3]
   \`\`\`
3. Use proper noun for function: "implement function twoSum", not "write code to".
4. Examples must show: Input → label each parameter by name, Output → exact return value, Explanation → step-by-step reasoning showing WHY the output is correct.
5. Constraints section must include: array size range (1 <= n <= 10^5), value range (-10^9 <= nums[i] <= 10^9), expected time complexity hint, and any special constraints.
6. Function signature must be clearly defined in the starter code with proper parameter names and return type comments.
7. Test cases: EXACTLY 5 test cases total -> 2 visible (matching your examples exactly, 'isHidden: false') + 3 hidden edge cases (empty-ish inputs, large n, negative values, duplicates, 'isHidden: true').
8. Starter code must have JSDoc/docstring with @param and @return annotations.
9. NEVER generate trivial problems: no "find maximum", no "count elements", no "sum of array", no "reverse a string" as standalone problems.
10. **CRITICAL: EXECUTION WRAPPER**: For every language provided in starterCode, you MUST provide corresponding \`wrapperCode\`. The wrapper code is appended to the user's code during execution. It must read all inputs from standard input (stdin), parse them according to the test case format, instantiate the class/function, call it, and print the result to stdout.

Respond ONLY with valid JSON — no markdown, no explanation, just the JSON object:
{
  "problems": [
    {
      "type": "CODING",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "topicTag": "e.g. Hash Map · Sliding Window · Dynamic Programming",
      "problemTitle": "e.g. Two Sum, Longest Substring Without Repeating Characters",
      "problemStatement": "Full LeetCode-style prose description. Include ASCII/Markdown diagrams if helpful. Describe what is given, what to return, any special rules. Use backticks for variable names like \`nums\` and \`target\`. End with: Return [exact description of what to return].",
      "constraints": "- 2 <= nums.length <= 10^4\\n- -10^9 <= nums[i] <= 10^9\\n- Only one valid answer exists\\n- Expected: O(n) time, O(n) space",
      "examples": [
        {
          "input": "nums = [2,7,11,15], target = 9",
          "output": "[0,1]",
          "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]. We check each element: 9 - 2 = 7, and 7 exists at index 1."
        }
      ],
      "testCases": [
        { "input": "[2,7,11,15]\\n9", "expectedOutput": "[0,1]", "isHidden": false },
        { "input": "[3,2,4]\\n6", "expectedOutput": "[1,2]", "isHidden": false },
        { "input": "[3,3]\\n6", "expectedOutput": "[0,1]", "isHidden": true },
        { "input": "[0,4,3,0]\\n0", "expectedOutput": "[0,3]", "isHidden": true },
        { "input": "[-1,-2,-3,-4,-5]\\n-8", "expectedOutput": "[2,4]", "isHidden": true }
      ],
      "starterCode": {
        "javascript": "/**\\n * @param {number[]} nums\\n * @param {number} target\\n * @return {number[]}\\n */\\nvar twoSum = function(nums, target) {\\n    \\n};",
        "python": "class Solution:\\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\\n        ",
        "java": "class Solution {\\n    public int[] twoSum(int[] nums, int target) {\\n        \\n    }\\n}",
        "cpp": "class Solution {\\npublic:\\n    vector<int> twoSum(vector<int>& nums, int target) {\\n        \\n    }\\n};"
      },
      "wrapperCode": {
        "javascript": "const fs = require('fs');\\nconst lines = fs.readFileSync(0, 'utf-8').trim().split('\\n');\\nconst nums = JSON.parse(lines[0]);\\nconst target = parseInt(lines[1]);\\nconsole.log(JSON.stringify(twoSum(nums, target)));",
        "python": "import sys\\nimport json\\n\\nif __name__ == '__main__':\\n    lines = sys.stdin.read().strip().split('\\n')\\n    if len(lines) >= 2:\\n        nums = json.loads(lines[0])\\n        target = int(lines[1])\\n        sol = Solution()\\n        res = sol.twoSum(nums, target)\\n        print(json.dumps(res, separators=(',', ':')))"
      }
    }
  ]
}`
}
