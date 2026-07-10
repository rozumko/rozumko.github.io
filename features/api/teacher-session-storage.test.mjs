import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const clientSource = await readFile(new URL('./client.ts', import.meta.url), 'utf8')
const teacherSource = await readFile(new URL('../../teacher.ts', import.meta.url), 'utf8')

test('teacher session: refresh tokens are not persisted to localStorage', () => {
  assert.doesNotMatch(clientSource, /localStorage\.setItem\(['"]teacher_session['"]/)
  assert.doesNotMatch(clientSource, /localStorage\.setItem\(TEACHER_SESSION_KEY/)
  assert.doesNotMatch(teacherSource, /localStorage\.setItem\(['"]teacher_session['"]/)
})

test('teacher session: writes go through the session helper', () => {
  assert.match(clientSource, /export function storeTeacherSession/)
  assert.match(clientSource, /sessionStorage\.setItem\(TEACHER_SESSION_KEY/)
  assert.match(teacherSource, /storeTeacherSession\(\{/)
})

test('parent session is tab-scoped and never persisted to localStorage', () => {
  assert.match(clientSource, /export function storeParentSession/)
  assert.match(clientSource, /sessionStorage\.setItem\(PARENT_SESSION_KEY/)
  assert.doesNotMatch(clientSource, /localStorage\.setItem\(PARENT_SESSION_KEY/)
  assert.match(clientSource, /activeChildProfileId/)
})
