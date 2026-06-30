import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { healthRoutes } from './health.js'

test('health endpoint does not require the database', async () => {
  const app = Fastify()
  let databaseChecks = 0
  await app.register(healthRoutes, {
    checkDatabase: async () => {
      databaseChecks += 1
      throw new Error('should not run')
    },
  })

  const response = await app.inject({ method: 'GET', url: '/health' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    status: 'ok',
    service: 'rozumko-backend',
  })
  assert.equal(databaseChecks, 0)
})

test('ready endpoint succeeds when the database check succeeds', async () => {
  const app = Fastify()
  await app.register(healthRoutes, {
    checkDatabase: async () => {},
  })

  const response = await app.inject({ method: 'GET', url: '/ready' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { status: 'ok', db: 'ok' })
})

test('ready endpoint fails closed when the database is unreachable', async () => {
  const app = Fastify()
  await app.register(healthRoutes, {
    checkDatabase: async () => {
      throw new Error('database down')
    },
  })

  const response = await app.inject({ method: 'GET', url: '/ready' })

  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json(), { status: 'error', db: 'unreachable' })
})

test('ping keeps the readiness-compatible database response', async () => {
  const app = Fastify()
  await app.register(healthRoutes, {
    checkDatabase: async () => {},
  })

  const response = await app.inject({ method: 'GET', url: '/ping' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { status: 'ok', db: 'ok' })
})
