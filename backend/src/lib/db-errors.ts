// Postgres error helpers shared by routes.

/** Drizzle wraps driver errors, so the Postgres code may sit on `cause`. */
export function isUniqueViolation(err: unknown): boolean {
  for (let current = err; typeof current === 'object' && current !== null; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === '23505') return true
  }
  return false
}
