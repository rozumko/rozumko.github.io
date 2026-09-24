// Lesson Engine stays dark until its pilot passes (ADR-0008). The switch is
// enforced on the server: hiding a menu item is never enough. Default: off, so
// a missing or mistyped value fails closed. Rollback is an env change, not a
// deploy: every other mode keeps working with the flag off.
export function isLessonEngineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LESSON_ENGINE_ENABLED === 'true'
}
