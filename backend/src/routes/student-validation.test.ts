import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeCode,
  validateCodeFormat,
  generateAttemptToken,
  verifyAttemptToken,
  normalizeStudentLabel,
  CODE_RE,
} from './student-validation.js'

// ── Формат коду ───────────────────────────────────────────────

test('CODE_RE приймає коректні формати', () => {
  assert.ok(CODE_RE.test('КІТ247'))
  assert.ok(CODE_RE.test('ВОЛ001'))
  assert.ok(CODE_RE.test('АБВГД999'))
  assert.ok(CODE_RE.test('АБ000'))
})

test('CODE_RE відхиляє некоректні формати', () => {
  assert.equal(CODE_RE.test('KIT247'),   false)  // латиниця
  assert.equal(CODE_RE.test('КІТ24'),    false)  // 2 цифри
  assert.equal(CODE_RE.test('К247'),     false)  // 1 літера
  assert.equal(CODE_RE.test('АБВГДЄ999'), false) // 6 літер
  assert.equal(CODE_RE.test(''),         false)
  assert.equal(CODE_RE.test('КІТ 247'), false)   // пробіл
})

test('normalizeCode обрізає пробіли та переводить у верхній регістр', () => {
  assert.equal(normalizeCode('  кіт247  '), 'КІТ247')
  assert.equal(normalizeCode('вол001'),     'ВОЛ001')
})

test('validateCodeFormat не кидає для коректного коду', () => {
  assert.doesNotThrow(() => validateCodeFormat('КІТ247'))
})

test('validateCodeFormat кидає для некоректного коду', () => {
  assert.throws(() => validateCodeFormat('KIT247'), /Невірний формат/)
  assert.throws(() => validateCodeFormat(''),       /Невірний формат/)
  assert.throws(() => validateCodeFormat('КІТ24'),  /Невірний формат/)
})

// ── HMAC attempt token ────────────────────────────────────────

test('generateAttemptToken повертає hex-рядок фіксованої довжини', () => {
  const token = generateAttemptToken('some-attempt-id')
  assert.equal(typeof token, 'string')
  assert.equal(token.length, 64)          // SHA-256 = 32 байти = 64 hex-символи
  assert.match(token, /^[0-9a-f]{64}$/)
})

test('generateAttemptToken детермінований: однаковий id → однаковий токен', () => {
  const id = 'efa1b2c3-dead-beef-cafe-000000000001'
  assert.equal(generateAttemptToken(id), generateAttemptToken(id))
})

test('generateAttemptToken різний для різних id', () => {
  const t1 = generateAttemptToken('id-aaaa')
  const t2 = generateAttemptToken('id-bbbb')
  assert.notEqual(t1, t2)
})

test('verifyAttemptToken повертає true для коректного токену', () => {
  const id    = 'test-attempt-id'
  const token = generateAttemptToken(id)
  assert.equal(verifyAttemptToken(id, token), true)
})

test('verifyAttemptToken повертає false для підробленого токену', () => {
  const id = 'test-attempt-id'
  assert.equal(verifyAttemptToken(id, 'a'.repeat(64)), false)
})

test('verifyAttemptToken повертає false для невалідного hex', () => {
  const id = 'test-attempt-id'
  assert.equal(verifyAttemptToken(id, 'not-hex'), false)
})

test('verifyAttemptToken повертає false для токену іншого id', () => {
  const tokenForOther = generateAttemptToken('other-id')
  assert.equal(verifyAttemptToken('my-id', tokenForOther), false)
})

// ── Мітка учня ───────────────────────────────────────────────

test('normalizeStudentLabel обрізає пробіли', () => {
  assert.equal(normalizeStudentLabel('  Маша К. '), 'Маша К.')
})

test('normalizeStudentLabel відхиляє порожній рядок', () => {
  assert.throws(() => normalizeStudentLabel(''),  /порожньою/)
  assert.throws(() => normalizeStudentLabel('  '), /порожньою/)
})

test('normalizeStudentLabel відхиляє рядок довше 60 символів', () => {
  assert.throws(
    () => normalizeStudentLabel('А'.repeat(61)),
    /60 символів/
  )
})

test('normalizeStudentLabel приймає рядок рівно 60 символів', () => {
  assert.doesNotThrow(() => normalizeStudentLabel('А'.repeat(60)))
})
