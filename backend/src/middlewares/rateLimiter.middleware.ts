import rateLimit from 'express-rate-limit'
import { Request } from 'express'
import { env } from '../config/env'

// Custom key generator that uses req.ip (which respects trust proxy setting)
const keyGenerator = (req: Request) => {
  return req.ip || 'unknown'
}

export const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max:      env.AUTH_RATE_LIMIT_MAX,
  message:  { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: 'draft-7', // Set header: X-RateLimit-*
  legacyHeaders:   false,      // Disable X-RateLimit-* headers
  keyGenerator,
  skip: () => !env.RATE_LIMIT_ENABLED || env.NODE_ENV !== 'production'
})

export const apiLimiter = rateLimit({
  windowMs: env.API_RATE_LIMIT_WINDOW_MS,
  max:      env.API_RATE_LIMIT_MAX,
  message:  { error: 'Too many requests.' },
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  keyGenerator,
  skip: () => !env.RATE_LIMIT_ENABLED || env.NODE_ENV !== 'production'
})

export const strikeEventLimiter = rateLimit({
  windowMs: env.STRIKE_RATE_LIMIT_WINDOW_MS,
  max:      env.STRIKE_RATE_LIMIT_MAX,
  message:  { error: 'Rate limit exceeded on proctoring events.' },
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  keyGenerator,
  skip: () => !env.RATE_LIMIT_ENABLED || env.NODE_ENV !== 'production'
})
