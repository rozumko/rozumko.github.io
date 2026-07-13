import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { getFastifyRateLimitOptions, getRateLimitConfig } from './rate-limit-config.js'
import { createVerifiedResourceRateLimit } from './rate-limit-policy.js'

test('rate-limit defaults to in-memory store', () => {
  assert.deepEqual(getRateLimitConfig({}), {
    max: 100,
    timeWindow: '1 minute',
    store: 'memory',
  })
})

test('rate-limit accepts explicit memory store', () => {
  assert.deepEqual(getRateLimitConfig({ RATE_LIMIT_STORE: 'memory' }), {
    max: 100,
    timeWindow: '1 minute',
    store: 'memory',
  })
})

test('rate-limit rejects redis mode until shared store is implemented', () => {
  assert.throws(
    () => getRateLimitConfig({ RATE_LIMIT_STORE: 'redis', REDIS_URL: 'redis://valkey:6379' }),
    /Unsupported RATE_LIMIT_STORE=redis/,
  )
})

test('fastify rate-limit options do not expose unsupported store config', () => {
  assert.deepEqual(getFastifyRateLimitOptions({ RATE_LIMIT_STORE: 'memory' }), {
    max: 100,
    timeWindow: '1 minute',
  })
})

test('verified resource buckets allow 30 students behind one NAT without weakening forged-token fallback', async () => {
  const createApp = async () => {
    const app = Fastify()
    await app.register(rateLimit, { max: 1, timeWindow: '1 minute' })

    app.get<{ Params: { id: string } }>('/probe/:id', {
      config: {
        rateLimit: createVerifiedResourceRateLimit({
          scope: 'nat-test',
          headerName: 'x-resource-token',
          max: 2,
          verifyToken: (resourceId, token) => token === `valid:${resourceId}`,
        }),
      },
    }, async () => ({ ok: true }))
    return app
  }

  const app = await createApp()
  const ids = Array.from({ length: 30 }, (_, index) => `student-${index + 1}`)
  const legitimate = await Promise.all(ids.map(id => app.inject({
    method: 'GET',
    url: `/probe/${id}`,
    headers: { 'x-resource-token': `valid:${id}` },
  })))

  assert.equal(legitimate.filter(response => response.statusCode === 200).length, 30)

  const sameStudentAgain = await app.inject({
    method: 'GET',
    url: `/probe/${ids[0]}`,
    headers: { 'x-resource-token': `valid:${ids[0]}` },
  })
  const sameStudentExceeded = await app.inject({
    method: 'GET',
    url: `/probe/${ids[0]}`,
    headers: { 'x-resource-token': `valid:${ids[0]}` },
  })
  assert.equal(sameStudentAgain.statusCode, 200)
  assert.equal(sameStudentExceeded.statusCode, 429)
  await app.close()

  const forgedApp = await createApp()
  const forged = []
  for (const id of ['forged-a', 'forged-b', 'forged-c']) {
    forged.push(await forgedApp.inject({
      method: 'GET',
      url: `/probe/${id}`,
      headers: { 'x-resource-token': `forged:${id}` },
    }))
  }
  assert.deepEqual(forged.map(response => response.statusCode), [200, 200, 429])
  await forgedApp.close()
})
