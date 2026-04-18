import OpenAI from 'openai'
import { env } from '../../config/env'

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL })

export async function textToSpeech(text: string): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: env.OPENAI_TTS_MODEL,
    voice: 'nova',
    input: text,
  })
  return Buffer.from(await response.arrayBuffer())
}
