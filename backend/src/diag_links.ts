import { prisma } from './lib/prisma'

async function main() {
  const users = await prisma.user.findMany({
    where: { role: 'CANDIDATE' },
    include: { candidateProfile: { select: { id: true, status: true } } }
  })

  console.log('--- CANDIDATE Link Integrity Check ---')
  for (const u of users) {
    const profiles = Array.isArray(u.candidateProfile)
      ? u.candidateProfile
      : (u.candidateProfile ? [u.candidateProfile] : [])
    const top = profiles[0]
    console.log(`User: ${u.email} [${u.id}]`)
    console.log(`  Profiles: ${profiles.length} | Primary: ${top ? top.id : '!!! MISSING !!!'} [Status: ${top?.status || 'N/A'}]`)
  }
}

main().catch(console.error)
