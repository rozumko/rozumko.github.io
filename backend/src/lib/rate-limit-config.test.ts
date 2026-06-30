import test from 'node:test'
import assert from 'node:assert/strict'
import { getFastifyRateLimitOptions, getRateLimitConfig } from './rate-limit-config.js'

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
