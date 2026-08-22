import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const homeDemo = readFileSync(new URL('../../home-demo.ts', import.meta.url), 'utf8')
const renderer = readFileSync(new URL('../../utils/question-renderer.ts', import.meta.url), 'utf8')
const policy = readFileSync(
  new URL('../../backend/src/lib/olympiad-content-policy.ts', import.meta.url),
  'utf8',
)

function keyFields() {
  const declaration = homeDemo.match(/const KEY_FIELDS = \[([^\]]+)\]/)
  assert.ok(declaration, 'home-demo.ts must declare KEY_FIELDS')
  return declaration[1].match(/'([^']+)'/g).map(name => name.slice(1, -1))
}

// A key the renderer can read is a key the renderer scores on. Home practice
// then shows correctness locally and skips submitAnswer, so the answer never
// lands in the parent report — and the mission looks unanswered to the app.
test('home practice strips every answer key the question renderer scores on', () => {
  const fields = keyFields()
  for (const field of ['correct', 'correctAnswers', 'correctOrder', 'pairs', 'answer']) {
    assert.match(renderer, new RegExp(`q\\.${field}\\b`), `renderer should read q.${field}`)
    assert.ok(fields.includes(field), `KEY_FIELDS is missing ${field}`)
  }
})

test('home practice key list stays in step with the backend secret keys', () => {
  const secrets = policy.match(/const secretKeys = new Set\(\[([^\]]+)\]\)/)
  assert.ok(secrets, 'olympiad-content-policy.ts must declare secretKeys')
  const fields = keyFields()
  for (const name of secrets[1].match(/'([^']+)'/g).map(item => item.slice(1, -1))) {
    assert.ok(fields.includes(name), `KEY_FIELDS is missing the backend secret key ${name}`)
  }
})
