import { prisma } from '../lib/prisma'
async function run() {
  const qs = await prisma.question.findMany({ 
    where: { OR: [ { problemTitle: { contains: 'LCS' } }, { problemTitle: { contains: 'Longest' } } ] },
    select: { id: true, problemTitle: true, starterCode: true }
  })
  console.log(JSON.stringify(qs, null, 2))
  process.exit(0)
}
run();
