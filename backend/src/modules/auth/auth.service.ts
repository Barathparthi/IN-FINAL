import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  blacklistToken,
  isTokenBlacklisted,
} from '../../lib/jwt'
import type { LoginInput, ChangePasswordInput } from './auth.dto'

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

function toProfileArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

// ─── Login ────────────────────────────────────────────────────

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: {
      candidateProfile: {
        select: { id: true, status: true, campaignId: true, createdAt: true, updatedAt: true },
      },
    },
  })

  if (!user || !user.isActive) {
    console.log(`[Auth:Login] User not found or inactive: ${input.email}`)
    throw { status: 401, message: 'Invalid email or password' }
  }

  const selectedCandidate = user.role === 'CANDIDATE'
    ? pickActiveCandidateProfile(toProfileArray(user.candidateProfile as any))
    : null

  if (user.role === 'CANDIDATE' && !selectedCandidate) {
    throw { status: 403, message: 'No campaign assignment found for this account.', code: 'NO_CAMPAIGN_ASSIGNMENT' }
  }

  // Candidate locked — recruiter has not granted permission yet
  if (user.role === 'CANDIDATE' && selectedCandidate?.status === 'LOCKED') {
    throw { status: 403, message: 'Your account has not been activated yet. Please wait for the recruiter to grant access.', code: 'CANDIDATE_LOCKED' }
  }

  // Candidate status check
  if (user.role === 'CANDIDATE' && selectedCandidate) {
    const status = selectedCandidate.status
    if (status === 'TERMINATED') {
      throw { status: 403, message: 'Your session was terminated due to proctoring violations.', code: 'CANDIDATE_TERMINATED' }
    }
    if (status === 'REJECTED') {
      throw { status: 403, message: 'Your application has been rejected. You can no longer log in.', code: 'CANDIDATE_REJECTED' }
    }
    if (status === 'COMPLETED') {
      throw { status: 403, message: 'You have already completed the assessment process.', code: 'CANDIDATE_COMPLETED' }
    }
  }

  const passwordMatch = await bcrypt.compare(input.password, user.passwordHash)
  if (!passwordMatch) {
    console.log(`[Auth:Login] Password mismatch for: ${input.email}`)
    throw { status: 401, message: 'Invalid email or password' }
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  // If candidate is LOCKED (first login) → move to READY if they have done everything
  // Actually, we can just leave it as is or move to a separate check.
  // For now, let's just use LOCKED.
  let effectiveCandidate = selectedCandidate
  if (user.role === 'CANDIDATE' && selectedCandidate?.status === 'INVITED') {
    await prisma.candidateProfile.update({
      where: { id: selectedCandidate.id },
      data: { status: 'ONBOARDING' },
    })
    effectiveCandidate = { ...selectedCandidate, status: 'ONBOARDING' } as any
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    candidateId: effectiveCandidate?.id,
  })

  const refreshToken = signRefreshToken(user.id)

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      candidateStatus: effectiveCandidate?.status ?? null,
      candidateId: effectiveCandidate?.id ?? null,
      campaignId: effectiveCandidate?.campaignId ?? null,
    },
  }
}

// ─── Refresh Access Token ─────────────────────────────────────

export async function refreshAccessToken(refreshToken: string) {
  // Check blacklist
  if (await isTokenBlacklisted(refreshToken)) {
    throw { status: 401, message: 'Token has been revoked' }
  }

  // Verify signature
  let payload: { sub: string }
  try {
    payload = verifyRefreshToken(refreshToken)
  } catch {
    throw { status: 401, message: 'Invalid or expired refresh token' }
  }

  // Check DB
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  })

  if (!stored || stored.expiresAt < new Date()) {
    throw { status: 401, message: 'Refresh token expired. Please log in again.' }
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: payload.sub },
    include: { candidateProfile: { select: { id: true, status: true, campaignId: true, createdAt: true, updatedAt: true } } },
  })

  const selectedCandidate = user.role === 'CANDIDATE'
    ? pickActiveCandidateProfile(toProfileArray(user.candidateProfile as any))
    : null

  const newAccessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    candidateId: selectedCandidate?.id,
  })

  return { accessToken: newAccessToken }
}

// ─── Logout ───────────────────────────────────────────────────

export async function logout(userId: string, accessToken: string, refreshToken?: string) {
  // Blacklist access token
  await blacklistToken(accessToken, userId, 'LOGOUT')

  // Delete refresh token from DB
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
  }

  // Log it
  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'USER_LOGOUT',
      entityType: 'User',
      entityId: userId,
    },
  })
}

// ─── Change Password ──────────────────────────────────────────

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  currentToken: string
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash)
  if (!valid) {
    throw { status: 400, message: 'Current password is incorrect' }
  }

  if (input.currentPassword === input.newPassword) {
    throw { status: 400, message: 'New password must be different from current password' }
  }

  const newHash = await bcrypt.hash(input.newPassword, 12)

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, mustChangePassword: false },
  })

  // Blacklist current token — force re-login with new password
  await blacklistToken(currentToken, userId, 'PASSWORD_CHANGE')

  // Invalidate all existing refresh tokens for this user
  await prisma.refreshToken.deleteMany({ where: { userId } })

  // If candidate — advance any ONBOARDING profile with uploaded resume to READY.
  await prisma.candidateProfile.updateMany({
    where: { userId, status: 'ONBOARDING', resumeUrl: { not: null } },
    data: { status: 'READY' },
  })

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
    },
  })
}

// ─── Get Current User ─────────────────────────────────────────

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      mustChangePassword: true,
      lastLoginAt: true,
      candidateProfile: {
        select: {
          id: true,
          status: true,
          campaignId: true,
          resumeUrl: true,
          createdAt: true,
          updatedAt: true,
          campaign: { select: { name: true, role: true } },
        },
      },
      recruiterProfile: {
        select: {
          id: true,
          department: true,
          assignments: {
            select: { campaign: { select: { id: true, name: true, status: true } } },
          },
        },
      },
      adminProfile: {
        select: { id: true, department: true },
      },
    },
  })

  if (user.role !== 'CANDIDATE') return user

  const profiles = toProfileArray(user.candidateProfile as any)
  const active = pickActiveCandidateProfile(profiles)

  return {
    ...user,
    candidateProfiles: profiles,
    candidateProfile: active,
  }
}
