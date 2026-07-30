import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const studentHtml = readFileSync(new URL('../../student.html', import.meta.url), 'utf8')
const studentSource = readFileSync(new URL('../../student.ts', import.meta.url), 'utf8')

test('demo recovery stays tab-scoped and restores the issued sanitized set', () => {
  assert.match(studentSource, /const DEMO_BACKUP_KEY = 'rozumko_demo_backup'/)
  assert.match(studentSource, /sessionStorage\.setItem\(DEMO_BACKUP_KEY/)
  assert.match(studentSource, /sessionStorage\.getItem\(DEMO_BACKUP_KEY\)/)
  assert.match(studentSource, /questionsCount: questions\.length/)
  assert.match(studentSource, /backup\.questions\.length === backup\.questionsCount/)
  assert.match(studentSource, /deadlineAt/)
  assert.match(studentSource, /recoveryExpiresAt/)
  assert.match(studentSource, /backup\.recoveryExpiresAt > now/)
  assert.match(studentSource, /Date\.now\(\) \+ demo\.tokenTtlMs/)
  assert.doesNotMatch(studentSource, /currentDemoTokenExpiresAt/)
  assert.doesNotMatch(studentSource, /localStorage\.setItem\(DEMO_BACKUP_KEY/)
})

test('loading overlay is initialized before synchronous recovery checks run', () => {
  const loaderDeclaration = studentSource.indexOf("const quizLoadingOverlay = $('quiz-loading-overlay')")
  const olympiadRecovery = studentSource.indexOf(';(function checkPendingOlympiad()')
  const demoRecovery = studentSource.indexOf(';(function checkPendingDemo()')

  assert.ok(loaderDeclaration >= 0)
  assert.ok(loaderDeclaration < olympiadRecovery)
  assert.ok(loaderDeclaration < demoRecovery)
})

test('demo result offers a new server-generated set', () => {
  assert.match(studentHtml, /id="result-retry-demo-btn"/)
  assert.match(studentSource, /resultRetryDemoBtn\.classList\.remove\('hidden'\)/)
  assert.match(studentSource, /startDemoFreeBtn\.click\(\)/)
})
