import type { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'

type HealthRoutesOptions = {
  checkDatabase?: () => Promise<void>
}

const defaultCheckDatabase = async () => {
  await db.execute(sql`SELECT 1`)
}

export async function healthRoutes(app: FastifyInstance, options: HealthRoutesOptions = {}) {
  const checkDatabase = options.checkDatabase ?? defaultCheckDatabase

  app.get('/health', async () => ({
    status: 'ok',
    service: 'rozumko-backend',
  }))

  app.get('/ready', async (_req, reply) => {
    try {
      await checkDatabase()
      return reply.send({ status: 'ok', db: 'ok' })
    } catch {
      return reply.code(503).send({ status: 'error', db: 'unreachable' })
    }
  })

  // /ping keeps the current UptimeRobot/Supabase keep-awake behavior.
  app.get('/ping', async (_req, reply) => {
    try {
      await checkDatabase()
      return reply.send({ status: 'ok', db: 'ok' })
    } catch {
      return reply.code(503).send({ status: 'error', db: 'unreachable' })
    }
  })
}
