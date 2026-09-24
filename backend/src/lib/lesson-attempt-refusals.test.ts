import test from 'node:test'
import assert from 'node:assert/strict'
import { ATTEMPT_REFUSAL_CODES, RETRYABLE_ATTEMPT_REFUSALS } from './lesson-attempt-refusals.js'

test('only transient refusals are retryable; a closed task or used attempts are final', () => {
  for (const code of RETRYABLE_ATTEMPT_REFUSALS) assert.ok(ATTEMPT_REFUSAL_CODES.includes(code), code)
  for (const final of ['RUN_CLOSED', 'DISPATCH_CLOSED', 'NOT_ACCEPTING', 'NO_ATTEMPTS_LEFT'] as const) {
    assert.ok(!RETRYABLE_ATTEMPT_REFUSALS.includes(final), final)
  }
})
