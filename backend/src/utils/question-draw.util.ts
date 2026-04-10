export function drawQuestions(questions: any[], count: number, cfg: any): any[] {
  if (questions.length <= count) {
    // If we have fewer or equal questions than requested, just return all shuffled
    return [...questions].sort(() => Math.random() - 0.5)
  }

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

  return result.sort(() => Math.random() - 0.5)
}
