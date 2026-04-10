import { prisma } from '../../lib/prisma'
import { gapAnalysisQueue } from '../../jobs/queue'
import { logger } from '../../lib/logger'

export async function bulkEvaluateRound(campaignId: string, roundId: string, passMarkPercent: number, adminUserId: string) {
  // Update the round pass mark configuration
  const round = await prisma.pipelineRound.findUniqueOrThrow({ where: { id: roundId } })
  const cfg = (round.roundConfig as any) || {}
  cfg.passMarkPercent = passMarkPercent
  await prisma.pipelineRound.update({
    where: { id: roundId },
    data: { roundConfig: cfg }
  })

  // Determine the next round for advancement
  const nextRound = await prisma.pipelineRound.findFirst({
    where: { campaignId, order: round.order + 1 }
  })

  // Find attempts pending review (passed === null and candidate status COMPLETED)
  const attempts = await prisma.candidateAttempt.findMany({
    where: { roundId, status: 'COMPLETED', passed: null, candidate: { status: 'COMPLETED' } },
    include: { candidate: true }
  })

  const results = { advanced: 0, rejected: 0 }

  for (const attempt of attempts) {
    const score = attempt.percentScore || 0
    const passed = score >= passMarkPercent

    // Mark the attempt as passed or failed
    await prisma.candidateAttempt.update({
      where: { id: attempt.id },
      data: { passed }
    })

    if (passed) {
      if (!nextRound) {
        // Last round
        await prisma.candidateProfile.update({
          where: { id: attempt.candidateId },
          data: { status: 'COMPLETED' }
        })
        await gapAnalysisQueue.add('analyze', { candidateId: attempt.candidateId })
      } else {
        // Advance
        await prisma.candidateProfile.update({
          where: { id: attempt.candidateId },
          data: { status: 'IN_PROGRESS' }
        })
        await prisma.auditLog.create({
          data: {
            actorId: adminUserId, actorRole: 'ADMIN',
            action: 'CANDIDATE_BULK_ADVANCED', entityType: 'CandidateProfile', entityId: attempt.candidateId,
            metadata: { fromRound: round.order, toRound: nextRound.order, percentScore: score.toFixed(1) }
          }
        })
      }
      results.advanced++
    } else {
      // Reject
      await prisma.candidateProfile.update({
        where: { id: attempt.candidateId },
        data: { status: 'REJECTED' }
      })
      await prisma.auditLog.create({
        data: {
          actorId: adminUserId, actorRole: 'ADMIN',
          action: 'CANDIDATE_BULK_REJECTED', entityType: 'CandidateProfile', entityId: attempt.candidateId,
          metadata: { reason: 'Failed pass mark in bulk review', percentScore: score.toFixed(1), passMarkPercent }
        }
      })
      results.rejected++
    }
  }

  logger.info(`[BulkEvaluate] Round ${round.order} eval complete: ${results.advanced} advanced, ${results.rejected} rejected.`)
  return results
}
