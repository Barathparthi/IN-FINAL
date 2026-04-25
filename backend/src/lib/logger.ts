import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV,
    service: 'indium-backend',
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: true,
        },
      },
})

export const httpLogger = (req: any, res: any, next: any) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info(
      {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration_ms: duration,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      },
      'HTTP request'
    )
  })
  next()
}
