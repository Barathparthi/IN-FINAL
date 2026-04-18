import OpenAI, { toFile } from 'openai' // 1. Import toFile helper
import { env } from '../../config/env'

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL })

export async function speechToText(audioBuffer: Buffer): Promise<{ text: string, confidence?: number }> {
  // 2. Use toFile to convert the buffer into a format the SDK understands
  const file = await toFile(audioBuffer, 'answer.webm', { type: 'audio/webm' });

  const result = await openai.audio.transcriptions.create({
    model: env.OPENAI_STT_MODEL,
    file,
    response_format: 'verbose_json',
  })

  return { text: result.text }
}