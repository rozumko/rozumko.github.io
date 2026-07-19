import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SCHOOL_AVATARS,
  isValidAvatar,
  normalizeNickname,
  validateJoinCodeFormat,
  generateJoinCode,
  normalizeDifficulty,
} from './school-validation.js'

test('isValidAvatar: приймає лише аватари з allowlist', () => {
  assert.equal(isValidAvatar(SCHOOL_AVATARS[0]), true)
  assert.equal(isValidAvatar('\u{1F648}'), false) // не в списку
  assert.equal(isValidAvatar('<img>'), false)     // спроба інʼєкції
  assert.equal(isValidAvatar(123), false)
  assert.equal(isValidAvatar(null), false)
})

test('normalizeNickname: обрізає пробіли', () => {
  assert.equal(normalizeNickname('  Маша  '), 'Маша')
})

test('normalizeNickname: прибирає керуючі символи', () => {
  // null та інші control-символи не мають потрапляти в мітку
  assert.equal(normalizeNickname('Маша' + String.fromCharCode(0)), 'Маша')
  assert.equal(normalizeNickname('Ма' + String.fromCharCode(9) + 'ша'), 'Ма ша')
})

test('normalizeNickname: зберігає звичайні пробіли й дефіси, згортає повтори', () => {
  assert.equal(normalizeNickname('Маша К'), 'Маша К')
  assert.equal(normalizeNickname('Ана-Марія'), 'Ана-Марія')
  assert.equal(normalizeNickname('Маша   К'), 'Маша К')
})

test('normalizeNickname: прибирає HTML-метасимволи (< > " \' &)', () => {
  assert.equal(normalizeNickname('<b>Маша</b>'), 'bМаша/b')
  assert.equal(normalizeNickname('Tom&Jerry'), 'TomJerry')
  assert.equal(normalizeNickname('"><script>'), 'script')
  assert.equal(normalizeNickname("O'Brien"), 'OBrien')
  // Рядок лише з метасимволів згортається в порожній → відхиляється як порожній
  assert.throws(() => normalizeNickname('<>&"\''), /Введи/)
})

test('normalizeNickname: відхиляє порожнє', () => {
  assert.throws(() => normalizeNickname('   '), /Введи/)
  assert.throws(() => normalizeNickname(''), /Введи/)
})

test('normalizeNickname: відхиляє задовге (>20)', () => {
  assert.throws(() => normalizeNickname('а'.repeat(21)), /Задовге/)
  assert.equal(normalizeNickname('а'.repeat(20)).length, 20)
})

test('validateJoinCodeFormat: лише 6 цифр', () => {
  assert.doesNotThrow(() => validateJoinCodeFormat('012345'))
  assert.throws(() => validateJoinCodeFormat('12345'))   // 5 цифр
  assert.throws(() => validateJoinCodeFormat('1234567')) // 7 цифр
  assert.throws(() => validateJoinCodeFormat('12a456'))  // літера
  assert.throws(() => validateJoinCodeFormat(''))
})

test('generateJoinCode: завжди 6 цифр із провідними нулями', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(generateJoinCode(), /^\d{6}$/)
  }
})

test('normalizeDifficulty: allowlist + null для порожнього', () => {
  assert.equal(normalizeDifficulty('easy'), 'easy')
  assert.equal(normalizeDifficulty('hard'), 'hard')
  assert.equal(normalizeDifficulty(null), null)
  assert.equal(normalizeDifficulty(''), null)
  assert.throws(() => normalizeDifficulty('impossible'))
})
