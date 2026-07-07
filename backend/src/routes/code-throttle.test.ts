import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearCodeThrottle,
  getCodeThrottleStatus,
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
