import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const clientSource = await readFile(new URL('./client.ts', import.meta.url), 'utf8')

// Regression: the client used to send Content-Type: application/json on every
// request, including bodiless DELETEs. Fastify answers such a request with
// FST_ERR_CTP_EMPTY_JSON_BODY, which server.ts masks as a bare "Невірний запит" —
// so deleting a question, a student or a registration silently failed for everyone.
test('Content-Type is sent only when the request carries a body', () => {
  assert.match(clientSource, /rest\.body != null \? \{ 'Content-Type': 'application\/json' \} : \{\}/)
  // and never unconditionally next to the spread of caller headers
  assert.doesNotMatch(clientSource, /headers: \{ 'Content-Type': 'application\/json', \.\.\.extraHeaders \}/)
})

test('bodiless DELETE helpers pass no body, so they must not declare JSON', () => {
  // Each of these is a DELETE with no `body:` — the case the guard above protects.
  for (const path of [
    /\/api\/teacher\/students\/\$\{studentId\}`, \{ method: 'DELETE' \}/,
    /\/api\/admin\/questions\/\$\{id\}`, \{ method: 'DELETE' \}/,
  ]) {
    assert.match(clientSource, path)
  }
})
