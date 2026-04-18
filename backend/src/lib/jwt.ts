import 'dotenv/config'
import jwt from 'jsonwebtoken'
import { prisma } from './prisma'
import type { Role } from '@prisma/client'
import { jwtConfig } from '../config/jwt.config'

export interface JWTPayload {
  sub:          string
  role:         Role
  candidateId?: string
  iat?:         number
  exp?:         number
}

export function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn as any,
  })
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn as any,
  })
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, jwtConfig.secret) as JWTPayload
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, jwtConfig.refreshSecret) as { sub: string }
}

export async function blacklistToken(token: string, userId: string, reason: string): Promise<void> {
  const decoded = jwt.decode(token) as JWTPayload | null
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 15 * 60 * 1000)

  await prisma.jWTBlacklist.upsert({
    where:  { token },
    update: {},
    create: { token, userId, reason, expiresAt },
  })
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  try {
    const record = await prisma.jWTBlacklist.findUnique({ where: { token } })
    return !!record
  } catch {
    return false
  }
}