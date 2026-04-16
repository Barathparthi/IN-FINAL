type McqCategory = 'TECHNICAL' | 'APTITUDE' | 'BEHAVIORAL'

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5)
}

function drawByDifficulty(questions: any[], count: number, cfg: any): any[] {
  if (questions.length <= count) return shuffle(questions)
  const byDifficulty = { EASY: [] as any[], MEDIUM: [] as any[], HARD: [] as any[] }
  for (const q of questions) byDifficulty[q.difficulty as keyof typeof byDifficulty]?.push(q)

  // Calculate target counts based on configuration percentages
  let easyTarget   = Math.round(count * ((cfg.difficultyEasy   || 33) / 100))
  let mediumTarget = Math.round(count * ((cfg.difficultyMedium || 34) / 100))
  let hardTarget   = count - easyTarget - mediumTarget

  const result: any[] = []
  const pools = [
    { key: 'EASY', target: easyTarget },
    { key: 'MEDIUM', target: mediumTarget },
    { key: 'HARD', target: hardTarget }
  ]

  // First pass: Pick up to the target count from each pool
  let shortfall = 0
  const pickedPools: any = { EASY: [], MEDIUM: [], HARD: [] }

  for (const p of pools) {
    const arr = byDifficulty[p.key as keyof typeof byDifficulty]
    const shuffled = [...arr].sort(() => Math.random() - 0.5)
    const canTake = Math.min(shuffled.length, p.target)
    pickedPools[p.key] = shuffled.slice(0, canTake)
    shortfall += (p.target - canTake)
  }

  // Second pass: Fill shortfall from remaining questions in any pool
  if (shortfall > 0) {
    const remaining = [
      ...byDifficulty.EASY.filter(q => !pickedPools.EASY.includes(q)),
      ...byDifficulty.MEDIUM.filter(q => !pickedPools.MEDIUM.includes(q)),
      ...byDifficulty.HARD.filter(q => !pickedPools.HARD.includes(q)),
    ].sort(() => Math.random() - 0.5)

    const fill = remaining.slice(0, shortfall)
    result.push(...fill)
  }

  // Combine everything
  result.push(...pickedPools.EASY, ...pickedPools.MEDIUM, ...pickedPools.HARD)

  return shuffle(result)
}

function inferMcqCategory(q: any): McqCategory {
  const tag = String(q?.topicTag || '').toUpperCase()
  if (tag.startsWith('APTITUDE:')) return 'APTITUDE'
  if (tag.startsWith('BEHAVIORAL:') || tag.startsWith('BEHAVIOURAL:')) return 'BEHAVIORAL'
  return 'TECHNICAL'
}

function splitEvenly(total: number, keys: readonly McqCategory[]): Record<McqCategory, number> {
  const safeTotal = Math.max(1, Number(total || 0))
  const base = Math.floor(safeTotal / keys.length)
  const remainder = safeTotal % keys.length
  const out = { TECHNICAL: base, APTITUDE: base, BEHAVIORAL: base }
  for (let i = 0; i < remainder; i += 1) out[keys[i]] += 1
  return out
}

export function drawQuestions(questions: any[], count: number, cfg: any): any[] {
  if (questions.length <= count) {
    return shuffle(questions)
  }

  const safeCount = Math.max(1, Math.min(count, questions.length))

  // MCQ-only balancing: enforce Technical/Aptitude/Behavioral even split.
  if ((cfg?.roundType || '').toUpperCase() === 'MCQ') {
    const categories: McqCategory[] = ['TECHNICAL', 'APTITUDE', 'BEHAVIORAL']
    const bucket: Record<McqCategory, any[]> = { TECHNICAL: [], APTITUDE: [], BEHAVIORAL: [] }

    for (const q of questions) {
      bucket[inferMcqCategory(q)].push(q)
    }

    const targets = splitEvenly(safeCount, categories)
    const picked = categories.flatMap((cat) => drawByDifficulty(bucket[cat], targets[cat], cfg))

    if (picked.length < safeCount) {
      const used = new Set(picked.map((q: any) => q.id))
      const remaining = questions.filter((q) => !used.has(q.id))
      picked.push(...drawByDifficulty(remaining, safeCount - picked.length, cfg))
    }

    return shuffle(picked).slice(0, safeCount)
  }

  return drawByDifficulty(questions, safeCount, cfg)
}
