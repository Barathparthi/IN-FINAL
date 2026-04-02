const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function run() {
  const qs = await prisma.question.findMany({ 
    where: { OR: [ { problemTitle: { contains: 'LCS' } }, { problemTitle: { contains: 'Longest' } } ] },
    select: { id: true, problemTitle: true, starterCode: true, solutionCode: true }
  })
  console.log(JSON.stringify(qs, null, 2))
  await prisma.$disconnect()
  process.exit(0)
}
run();
