import OpenAI from 'openai'
import { env } from './env'

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL })
export const OPENAI_MODEL     = env.OPENAI_MODEL
export const OPENAI_TTS_MODEL = env.OPENAI_TTS_MODEL
export const OPENAI_STT_MODEL = env.OPENAI_STT_MODEL
