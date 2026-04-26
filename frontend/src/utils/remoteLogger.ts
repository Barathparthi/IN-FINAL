type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogPayload {
  level: LogLevel
  message: string
  context?: Record<string, any>
  stack?: string
}

const API_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const remoteLogger = {
  debug: (message: string, context?: any) => send('debug', message, context),
  info: (message: string, context?: any) => send('info', message, context),
  warn: (message: string, context?: any) => send('warn', message, context),
  error: (error: Error | string, context?: any) => {
    const message = typeof error === 'string' ? error : error.message
    const stack = error instanceof Error ? error.stack : undefined
    send('error', message, context, stack)
  },
}

async function send(level: LogLevel, message: string, context?: any, stack?: string) {
  try {
    await fetch(`${API_URL}/internal/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, context, stack } as LogPayload),
    })
  } catch (err) {
    console.error('Failed to send log to backend:', err)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    remoteLogger.error(event.error || event.message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    remoteLogger.error(String(event.reason))
  })
}
