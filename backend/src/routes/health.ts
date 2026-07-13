import type { FastifyInstance } from 'fastify'
import { pool } from '../db/index.js'
import { MigrationDriftError, checkDatabaseMigrations } from '../db/migration-status.js'

type HealthRoutesOptions = {
  checkDatabase?: () => Promise<void>
}

const defaultCheckDatabase = async () => {
  await pool.query('SELECT 1')
  await checkDatabaseMigrations(pool)
}

function readinessFailure(error: unknown) {
  return error instanceof MigrationDriftError
    ? { status: 'error', db: 'migration_required' }
    : { status: 'error', db: 'unreachable' }
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
    } catch (error) {
      return reply.code(503).send(readinessFailure(error))
    }
  })

  // /ping keeps the current UptimeRobot/Supabase keep-awake behavior.
  app.get('/ping', async (_req, reply) => {
    try {
      await checkDatabase()
      return reply.send({ status: 'ok', db: 'ok' })
    } catch (error) {
      return reply.code(503).send(readinessFailure(error))
    }
  })
}
