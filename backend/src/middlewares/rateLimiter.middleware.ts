import rateLimit from 'express-rate-limit'
import { Request } from 'express'

// Custom key generator that uses req.ip (which respects trust proxy setting)
const keyGenerator = (req: Request) => {
  return req.ip || 'unknown'
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: 'draft-7', // Set header: X-RateLimit-*
  legacyHeaders:   false,      // Disable X-RateLimit-* headers
  keyGenerator,
  skip: (req) => process.env.NODE_ENV !== 'production'
})

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      500,
  message:  { error: 'Too many requests.' },
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  keyGenerator,
  skip: (req) => process.env.NODE_ENV !== 'production'
})

export const strikeEventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      60,
  message:  { error: 'Rate limit exceeded on proctoring events.' },
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  keyGenerator,
  skip: (req) => process.env.NODE_ENV !== 'production'
})
