// The Lesson Builder's "from lessons" panel needs every lesson's blocks at once
// to filter cards by type. Embedded files dominate the size of a definition
// and a thumbnail does not need them, so their payload is replaced by an empty
// string; the full lesson is fetched only when a card is actually added.

/** Deep copy with `{ type: 'file', data }` payloads emptied. */
export function withoutFilePayloads<T>(value: T): T {
  if (Array.isArray(value)) return value.map(entry => withoutFilePayloads(entry)) as T
  if (!value || typeof value !== 'object') return value
  const source = value as Record<string, unknown>
  const copy: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(source)) {
    copy[key] = source.type === 'file' && key === 'data' && typeof entry === 'string' ? '' : withoutFilePayloads(entry)
  }
  return copy as T
}
