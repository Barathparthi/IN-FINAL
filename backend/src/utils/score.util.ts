export function calculateMCQScore(p: {
  isCorrect: boolean, attempted: boolean,
  marksPerQuestion: number, negativeMarking: boolean, penaltyPerWrong: number
}): number {
  if (!p.attempted) return 0
  if (p.isCorrect)  return p.marksPerQuestion
  return p.negativeMarking ? -p.penaltyPerWrong : 0
}

export function calculateCodingScore(passed: number, total: number): number {
  if (total === 0) return 0
  return parseFloat(((passed / total) * 10).toFixed(2))
}

export function calculatePassFail(score: number, maxScore: number, passMarkPercent: number): boolean {
  if (maxScore === 0) return false
  return (score / maxScore) * 100 >= passMarkPercent
}

const FILLER_WORDS = ['um','uh', 'like', 'you know', 'basically', 'literally', 'actually', 'so', 'right', 'okay', 'er', 'hmm']

export function calculateDeliveryMetrics(transcript: string, durationSecs: number) {
  const words          = transcript.trim().split(/\s+/).filter(Boolean)
  const wordCount      = words.length
  const fillerWordCount = words.filter(w => FILLER_WORDS.includes(w.toLowerCase().replace(/[^a-z]/g, ''))).length
  const fillerWordRatio = wordCount > 0 ? fillerWordCount / wordCount : 0
  
  // Estimate speech duration if not provided (approx 4 words per second)
  const speechDuration  = Math.min(wordCount * 0.4, durationSecs)
  const silenceRatio    = durationSecs > 0 ? Math.max(0, 1 - speechDuration / durationSecs) : 0
  const wordsPerMinute  = speechDuration > 0 ? (wordCount / speechDuration) * 60 : 0

  let score = 10
  if (wordsPerMinute < 60)   score -= 2.5
  else if (wordsPerMinute < 100) score -= 1
  else if (wordsPerMinute > 200) score -= 2
  else if (wordsPerMinute > 180) score -= 1
  if (silenceRatio > 0.6)    score -= 2.5
  else if (silenceRatio > 0.4) score -= 1
  if (fillerWordCount > 20)  score -= 2 // Heuristic based count
  if (fillerWordRatio > 0.15) score -= 2
  else if (fillerWordRatio > 0.08) score -= 1
  if (durationSecs < 10) score -= 3 // MIN_ANSWER_SECONDS=10

  return {
    durationSeconds: durationSecs,
    speechDuration,
    silenceRatio,
    wordsPerMinute,
    wordCount,
    fillerWordCount,
    fillerWordRatio,
    deliveryScore: Math.max(0, Math.min(10, score)),
  }
}
