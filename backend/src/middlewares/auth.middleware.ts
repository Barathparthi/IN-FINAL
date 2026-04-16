import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, isTokenBlacklisted } from '../lib/jwt'
import type { Role } from '@prisma/client'

const CANDIDATE_STATUS_PRIORITY: Record<string, number> = {
  IN_PROGRESS: 1,
  READY: 2,
  ONBOARDING: 3,
  INVITED: 4,
  LOCKED: 5,
  SHORTLISTED: 6,
  COMPLETED: 7,
  DISQUALIFIED: 8,
  REJECTED: 9,
  TERMINATED: 10,
}

function pickActiveCandidateProfile<T extends { status: string; updatedAt?: Date; createdAt?: Date }>(profiles: T[]): T | null {
  if (!profiles?.length) return null
  return [...profiles].sort((a, b) => {
    const pa = CANDIDATE_STATUS_PRIORITY[a.status] ?? 999
    const pb = CANDIDATE_STATUS_PRIORITY[b.status] ?? 999
    if (pa !== pb) return pa - pb
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return tb - ta
  })[0]
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string
        role: Role
        candidateId?: string
      }
    }
  }
}

// ─── Authenticate ─────────────────────────────────────────────
// Verifies JWT, checks blacklist, attaches req.user

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token missing' })
  }

  const token = authHeader.slice(7)

  try {
    // Check blacklist FIRST — catches terminated candidates immediately
    const blacklisted = await isTokenBlacklisted(token)
    if (blacklisted) {
      return res.status(401).json({
        error: 'Session has been revoked',
        code: 'TOKEN_REVOKED',
      })
    }

    const payload = verifyAccessToken(token)

    req.user = {
      userId: payload.sub,
      role: payload.role,
      candidateId: payload.candidateId,
    }

    // Fallback: if candidateId is missing from token but user is a candidate, look it up
    if (!req.user.candidateId && req.user.role === 'CANDIDATE') {
      const { prisma } = await import('../lib/prisma')
      const profiles = await prisma.candidateProfile.findMany({
        where: { userId: payload.sub },
        select: { id: true, status: true, updatedAt: true, createdAt: true },
      })
      const profile = pickActiveCandidateProfile(profiles as any[])
      if (profile) req.user.candidateId = profile.id
    }

    next()
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
    }
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// ─── Role Guard ───────────────────────────────────────────────

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

// Convenience
export const requireAdmin     = requireRole('ADMIN')
export const requireRecruiter = requireRole('RECRUITER', 'ADMIN')
export const requireCandidate = requireRole('CANDIDATE')
