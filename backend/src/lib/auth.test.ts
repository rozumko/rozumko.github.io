import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRole } from './auth.js'

test('checkRole: дозволяє точний збіг ролі', () => {
  assert.equal(checkRole('teacher', 'teacher'), null)
})

test('checkRole: admin проходить будь-яку вимогу', () => {
  assert.equal(checkRole('admin', 'teacher'), null)
  assert.equal(checkRole('admin', 'admin'), null)
})

test('checkRole: повертає помилку якщо роль не підходить', () => {
  assert.equal(checkRole('teacher', 'admin'), 'Недостатньо прав')
})

test('checkRole: повертає помилку якщо роль undefined', () => {
  assert.equal(checkRole(undefined, 'teacher'), 'Потрібна авторизація')
})

test('checkRole: невідома роль відхиляється', () => {
  assert.equal(checkRole('student', 'teacher'), 'Недостатньо прав')
})
