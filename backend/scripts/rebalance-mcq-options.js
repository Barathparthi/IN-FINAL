const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const OPTION_IDS = ['A', 'B', 'C', 'D']

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

function normalizeMcqOptions(options) {
  const raw = Array.isArray(options) ? options : []
  const cleaned = raw
    .map((opt, idx) => ({
      id: OPTION_IDS[idx] || String(idx + 1),
      text: String(opt?.text || '').trim(),
      isCorrect: !!opt?.isCorrect,
    }))
    .filter((opt) => opt.text.length > 0)

  if (cleaned.length < 2) return null

  let correctIndex = cleaned.findIndex((opt) => opt.isCorrect)
  if (correctIndex < 0) correctIndex = Math.floor(Math.random() * cleaned.length)
  cleaned.forEach((opt, idx) => {
    opt.isCorrect = idx === correctIndex
  })

  const randomized = shuffle(cleaned)
  return randomized.map((opt, idx) => ({
    id: OPTION_IDS[idx] || String(idx + 1),
    text: opt.text,
    isCorrect: opt.isCorrect,
  }))
}

async function main() {
  const mcqs = await prisma.question.findMany({
    where: { type: 'MCQ' },
    select: { id: true, options: true },
  })

  let updated = 0
  let skipped = 0

  for (const q of mcqs) {
    const normalized = normalizeMcqOptions(q.options)
    if (!normalized) {
      skipped += 1
      continue
    }

    await prisma.question.update({
      where: { id: q.id },
      data: { options: normalized },
    })
    updated += 1
  }

  console.log(JSON.stringify({ total: mcqs.length, updated, skipped }))
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
