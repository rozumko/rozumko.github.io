import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const adminHtml = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8')
const questionsTab = readFileSync(new URL('./questions-tab.ts', import.meta.url), 'utf8')
const apiClient = readFileSync(new URL('../api/client.ts', import.meta.url), 'utf8')

test('question editor exposes mutually exclusive main-round and training-channel controls', () => {
  for (const id of [
    'qf-olympiad',
    'qf-channel-class-game',
    'qf-channel-path',
    'qf-channel-olympiad-training',
  ]) assert.match(adminHtml, new RegExp(`id="${id}"`))
  assert.match(questionsTab, /if \(isMainRound\) input\.checked = false/)
  assert.match(questionsTab, /channels:\s+selectedChannels\(\)/)
})

test('question bank presents one section filter while preserving secure query mapping', () => {
  assert.doesNotMatch(adminHtml, /id="q-filter-pool"/)
  assert.match(adminHtml, /id="q-filter-mechanic"/)
  assert.match(adminHtml, /id="q-filter-section"/)
  for (const value of ['class_game', 'path', 'olympiad_training', 'main_round']) {
    assert.match(adminHtml, new RegExp(`option value="${value}"`))
  }
  assert.match(questionsTab, /const isMainRound = section === 'main_round'/)
  assert.match(questionsTab, /const isOlympiad = section \? isMainRound : undefined/)
  assert.match(questionsTab, /section && !isMainRound \? section as QuestionChannel : undefined/)
  assert.match(apiClient, /p\.set\('channel',\s+String\(params\.channel\)\)/)
  assert.match(apiClient, /p\.set\('type',\s+String\(params\.type\)\)/)
})

test('admin help explains the complete question workflow in plain language', () => {
  assert.match(adminHtml, /data-tab="help"/)
  assert.match(adminHtml, /id="tab-help"/)
  assert.match(adminHtml, /Рекомендований порядок роботи/)
  assert.match(adminHtml, /Олімпіада — основний тур/)
  assert.match(adminHtml, /Статуси питання/)
  assert.match(adminHtml, /Перевір перед публікацією/)
})
