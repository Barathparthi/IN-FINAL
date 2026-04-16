const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const rounds = await prisma.pipelineRound.findMany({
    where: { roundType: 'MCQ' },
    select: {
      campaignId: true,
      order: true,
      questionPool: {
        select: {
          questions: {
            where: { type: 'MCQ', isActive: true },
            select: { options: true },
          },
        },
      },
    },
  })

  for (const round of rounds) {
    const questions = round.questionPool?.questions || []
    if (questions.length === 0) continue

    const counts = { A: 0, B: 0, C: 0, D: 0, OTHER: 0 }

    for (const q of questions) {
      const options = Array.isArray(q.options) ? q.options : []
      const correct = options.find((o) => o && o.isCorrect)
      const id = String(correct?.id || 'OTHER').toUpperCase()
      if (Object.prototype.hasOwnProperty.call(counts, id)) counts[id] += 1
      else counts.OTHER += 1
    }

    console.log(
      JSON.stringify({
        campaignId: round.campaignId,
        roundOrder: round.order,
        total: questions.length,
        counts,
      }),
    )
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
