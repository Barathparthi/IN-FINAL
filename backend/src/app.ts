import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import { apiReference } from '@scalar/express-api-reference'
import { authLimiter, apiLimiter } from './middlewares/rateLimiter.middleware'
import { errorHandler } from './middlewares/error.middleware'

import { authRouter }       from './modules/auth/auth.routes'
import { adminRouter }      from './modules/admin/admin.routes'
import { campaignRouter }   from './modules/campaign/campaign.routes'
import { questionRouter }   from './modules/question/question.routes'
import { recruiterRouter }  from './modules/recruiter/recruiter.routes'
import { candidateRouter }  from './modules/candidate/candidate.routes'
import { attemptRouter }    from './modules/attempt/attempt.routes'
import { proctoringRouter } from './modules/proctoring/proctoring.routes'
import { scorecardRouter }  from './modules/scorecard/scorecard.routes'
import { aiRouter }         from './modules/ai/ai.routes'

import path from 'path'

const app = express()

// Trust proxy is essential behind Nginx/Heroku/Vercel for rate limiting
app.set('trust proxy', 1)

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))
const clientUrlRaw = process.env.CLIENT_URL || process.env.FRONTEND_URL || ''
const corsOrigins = clientUrlRaw.split(',').map((origin) => origin.trim()).filter(Boolean)
app.use(cors({ 
  origin: corsOrigins.length > 0 ? corsOrigins : true, 
  credentials: true 
}))
app.use(compression()) // Compress responses
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev'
app.use(morgan(logFormat))

// Static files (resumes, proctoring snapshots, etc.)
app.use('/uploads',   express.static(path.join(process.cwd(), 'uploads')))
app.use('/downloads', express.static(path.join(process.cwd(), 'downloads')))

app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }))

app.get('/openapi.json', (_, res) => {
  res.sendFile(path.join(process.cwd(), 'openapi.json'))
})

const scalarDocsCsp = [
  "default-src 'self' https: data:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https:",
].join('; ')

app.use('/docs', (req, res, next) => {
  res.setHeader('Content-Security-Policy', scalarDocsCsp)
  next()
}, apiReference({ url: '/openapi.json'}))

// Apply auth limiter to auth routes first
app.use('/api/auth', authLimiter, authRouter)

// Apply general rate limiter to all other /api routes before route handlers
app.use('/api', apiLimiter)

// Register API route handlers
app.use('/api/admin',      adminRouter)
app.use('/api/campaigns',  campaignRouter)
app.use('/api/questions',  questionRouter)
app.use('/api/recruiter',  recruiterRouter)
app.use('/api/candidate',  candidateRouter)
app.use('/api/attempt',    attemptRouter)
app.use('/api/proctoring', proctoringRouter)
app.use('/api/scorecard',  scorecardRouter)
app.use('/api/ai',         aiRouter)

app.use(errorHandler)

export default app
