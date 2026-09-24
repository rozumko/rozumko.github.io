// ── Lesson Engine: why a device attempt was refused (stage J) ────────────────
// The student device keeps an answer in its offline outbox and sends it again
// later only for the transient reasons below; every other refusal is final
// and the queued answer is dropped with a message to the child. The frontend
// outbox mirrors RETRYABLE_ATTEMPT_REFUSALS; a guard test keeps them in sync.

export const ATTEMPT_REFUSAL_CODES = [
  'NOT_MAPPED', // the teacher has not yet said who this device is
  'RUN_NOT_ACTIVE', // the lesson is paused (or not started yet)
  'RETRY', // a concurrent send of the same attempt won the race
  'RUN_CLOSED',
  'DISPATCH_CLOSED',
  'NOT_ACCEPTING',
  'NO_ATTEMPTS_LEFT',
] as const

export type AttemptRefusalCode = typeof ATTEMPT_REFUSAL_CODES[number]

export const RETRYABLE_ATTEMPT_REFUSALS: readonly AttemptRefusalCode[] = ['NOT_MAPPED', 'RUN_NOT_ACTIVE', 'RETRY']
