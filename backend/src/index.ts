import 'dotenv/config'
import http from 'http'
import app from './app'
import { prisma } from './lib/prisma'
import { logger } from './lib/logger'
import { initProctoringGateway } from './modules/proctoring/proctoring.gateway'

// Register background jobs (pure Node.js — no Redis needed)
import './jobs/pool-generation.job'
import './jobs/gap-analysis.job'
import './jobs/jwt-cleanup.job'

const PORT = process.env.PORT || 4000

let httpServer: http.Server

async function bootstrap() {
  await prisma.$connect()
  logger.info('✅ Database connected')

  httpServer = http.createServer(app)

  initProctoringGateway(httpServer)
  logger.info('✅ WebSocket gateway ready')
  logger.info('✅ Background jobs registered (in-process, no Redis)')

  httpServer.listen(PORT, () => {
    logger.info(`🚀 Indium API on port ${PORT} [${process.env.NODE_ENV}]`)
  })
}

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.warn(`🛑 ${signal} received. Closing HTTP server...`)
  
  if (httpServer) {
    httpServer.close(async () => {
      logger.info('HTTP server closed.')
      
      try {
        await prisma.$disconnect()
        logger.info('Database disconnected.')
        process.exit(0)
      } catch (err) {
        logger.error('Error during database disconnection:', err)
        process.exit(1)
      }
    })
  } else {
    process.exit(0)
  }

  // Force shutdown after 10s if graceful fails
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

bootstrap().catch((err) => {
  logger.error('Fatal startup error', err)
  process.exit(1)
})