import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(new URL('../../scripts/load-test-attempt-flow.mjs', import.meta.url))

function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  })
}

test('load test has no implicit production target', () => {
  const result = run(['--codes', 'TEST-CODE'])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /Missing --base-url; the load test has no default target/)
})

test('load test refuses the production Render hostname without explicit override', () => {
  const result = run([
    '--base-url', 'https://rozumko-github-io.onrender.com',
    '--codes', 'TEST-CODE',
  ])

  assert.equal(result.status, 1)
  assert.match(result.stderr, /Refusing production load target/)
  assert.match(result.stderr, /--allow-production/)
})

test('load test help documents the explicit production override', () => {
  const result = run(['--help'])

  assert.equal(result.status, 0)
  assert.match(result.stdout, /--base-url URL\s+Required staging/)
  assert.match(result.stdout, /--allow-production\s+Explicitly permit/)
})
