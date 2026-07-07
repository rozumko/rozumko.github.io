import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearCodeThrottle,
  getCodeThrottleStatus,
  getCodeThrottleBucketCountForTests,
  MAX_CODE_THROTTLE_BUCKETS,
  recordCodeFailure,
  resetCodeThrottleForTests,
} from './code-throttle.js'

test('code throttle blocks after repeated failures and then cools down', () => {
  resetCodeThrottleForTests()
  const scope = 'test-scope'
  const code = 'ABC123'
  const start = 1_000_000

  for (let i = 0; i < 4; i++) {
    assert.deepEqual(getCodeThrottleStatus(scope, code, start + i), { allowed: true })
    recordCodeFailure(scope, code, start + i)
  }

  assert.deepEqual(getCodeThrottleStatus(scope, code, start + 10), { allowed: true })
  recordCodeFailure(scope, code, start + 10)

  const blocked = getCodeThrottleStatus(scope, code, start + 11)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.allowed === false && blocked.retryAfterSeconds > 0, true)

  assert.deepEqual(getCodeThrottleStatus(scope, code, start + 2 * 60 * 1000 + 11), { allowed: true })
})

test('code throttle is scoped and can be cleared after a valid code', () => {
  resetCodeThrottleForTests()
  const now = 2_000_000
  for (let i = 0; i < 5; i++) recordCodeFailure('student', 'CODE1', now + i)

  assert.equal(getCodeThrottleStatus('student', 'CODE1', now + 10).allowed, false)
  assert.deepEqual(getCodeThrottleStatus('school', 'CODE1', now + 10), { allowed: true })

  clearCodeThrottle('student', 'CODE1')
  assert.deepEqual(getCodeThrottleStatus('student', 'CODE1', now + 10), { allowed: true })
})

test('code throttle caps buckets and evicts the oldest key', () => {
  resetCodeThrottleForTests()
  const scope = 'cap-test'
  const oldestCode = 'CODE-OLDEST'
  const start = 3_000_000

  for (let i = 0; i < 4; i++) recordCodeFailure(scope, oldestCode, start + i)

  for (let i = 1; i < MAX_CODE_THROTTLE_BUCKETS; i++) {
    recordCodeFailure(scope, `CODE-${i}`, start + 100 + i)
  }

  assert.equal(getCodeThrottleBucketCountForTests(), MAX_CODE_THROTTLE_BUCKETS)
  recordCodeFailure(scope, 'CODE-NEW', start + 200 + MAX_CODE_THROTTLE_BUCKETS)
  assert.equal(getCodeThrottleBucketCountForTests(), MAX_CODE_THROTTLE_BUCKETS)

  recordCodeFailure(scope, oldestCode, start + 300 + MAX_CODE_THROTTLE_BUCKETS)
  assert.deepEqual(getCodeThrottleStatus(scope, oldestCode, start + 301 + MAX_CODE_THROTTLE_BUCKETS), { allowed: true })
})
