import { z } from 'zod'

const boolFromEnv = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v == null ? defaultValue : v === 'true'))

const numberFromEnv = (defaultValue: number, min = 1) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number(v) : defaultValue
      return Number.isFinite(n) ? n : defaultValue
    })
    .refine((v) => v >= min, `must be >= ${min}`)

const EnvSchema = z.object({
  DATABASE_URL:      z.string(),
  JWT_SECRET:        z.string().min(32),
  JWT_EXPIRES_IN:    z.string().default('15m'),
  JWT_REFRESH_SECRET:z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  PORT:              z.string().default('4000'),
  NODE_ENV:          z.enum(['development', 'production', 'test']).default('development'),
  TRUST_PROXY:       numberFromEnv(1, 0),
  JSON_LIMIT:        z.string().default('10mb'),
  CLIENT_URL:        z.string().optional().default(''),
  FRONTEND_URL:      z.string().optional().default(''),
  BACKEND_URL:       z.string().optional().default(''),
  CORS_ALLOW_ALL:    boolFromEnv(false),
  ENABLE_API_DOCS:   boolFromEnv(true),
  RATE_LIMIT_ENABLED: boolFromEnv(true),
  AUTH_RATE_LIMIT_WINDOW_MS:   numberFromEnv(15 * 60 * 1000, 1000),
  AUTH_RATE_LIMIT_MAX:         numberFromEnv(20, 1),
  API_RATE_LIMIT_WINDOW_MS:    numberFromEnv(15 * 60 * 1000, 1000),
  API_RATE_LIMIT_MAX:          numberFromEnv(500, 1),
  STRIKE_RATE_LIMIT_WINDOW_MS: numberFromEnv(60 * 1000, 1000),
  STRIKE_RATE_LIMIT_MAX:       numberFromEnv(60, 1),
  
  // AI Config (Groq routed through OpenAI SDK)
  OPENAI_API_KEY:    z.string(), // This will hold your GROQ_API_KEY
  OPENAI_BASE_URL:   z.string().default('https://api.groq.com/openai/v1'),
  OPENAI_MODEL:      z.string().default('llama-3.3-70b-versatile'),
  OPENAI_TTS_MODEL:  z.string().default('tts-1'),
  OPENAI_STT_MODEL:  z.string().default('whisper-large-v3-turbo'),
  
  // Judge0
  JUDGE0_API_URL:    z.string().default('http://localhost:2358'),
  JUDGE0_API_KEY:    z.string().optional().default(''),

  // Email
  AZURE_TENANT_ID:   z.string(),
  AZURE_CLIENT_ID:   z.string(),
  AZURE_CLIENT_SECRET: z.string(),
  GRAPH_SENDER_EMAIL: z.string().email(),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY:    z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
})

export const env = EnvSchema.parse(process.env)