import test from 'node:test'
import assert from 'node:assert/strict'

import { FO_LEVEL1_STATEMENTS, FO_LEVEL2_STATEMENTS } from './fact-opinion-data.ts'
import { pickFoRound } from './fact-opinion-game.ts'

const ALL = [...FO_LEVEL1_STATEMENTS, ...FO_LEVEL2_STATEMENTS]

test('ідентифікатори унікальні між рівнями', () => {
  const ids = ALL.map(s => s.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('кожне твердження має текст, пояснення і валідну категорію', () => {
  for (const s of ALL) {
    assert.ok(s.text.length > 4, s.id)
    assert.ok(s.explanation.length > 4, s.id)
    assert.ok(['fact', 'opinion', 'myth'].includes(s.category), s.id)
  }
})

test('рівень 1 — дві категорії (факт/думка), без міфів', () => {
  const cats = new Set(FO_LEVEL1_STATEMENTS.map(s => s.category))
  assert.deepEqual([...cats].sort(), ['fact', 'opinion'])
})

test('рівень 2 містить усі три категорії, міфи — лише серед не-фактів', () => {
  const cats = new Set(FO_LEVEL2_STATEMENTS.map(s => s.category))
  assert.deepEqual([...cats].sort(), ['fact', 'myth', 'opinion'])
  assert.ok(FO_LEVEL2_STATEMENTS.filter(s => s.category === 'myth').length >= 5)
})

test('джерела: URL лише валідні http(s), і тільки у фактів', () => {
  for (const s of ALL) {
    if (s.sourceUrl) {
      assert.match(s.sourceUrl, /^https?:\/\//, s.id)
      assert.equal(s.category, 'fact', `${s.id}: URL має сенс лише для фактів`)
    }
  }
  // Кожен факт 2-го рівня має посилання (контентна планка з аналізу)
  for (const s of FO_LEVEL2_STATEMENTS.filter(x => x.category === 'fact')) {
    assert.ok(s.sourceUrl, `${s.id}: факт L2 без джерела`)
  }
})

test('джерела фактів ведуть на конкретні матеріали, а не головні сторінки', () => {
  const genericHomepages = new Set([
    'https://www.britannica.com/',
    'https://zakon.rada.gov.ua/',
    'https://ev.vue.gov.ua/',
    'https://esu.com.ua/',
    'https://kids.nationalgeographic.com/',
    'https://www.smithsonianmag.com/',
    'https://www.usgs.gov/',
    'https://medlineplus.gov/',
    'https://www.batcon.org/',
    'https://www.worldwildlife.org/',
    'https://science.nasa.gov/',
    'https://animals.sandiegozoo.org/',
  ])
  for (const statement of [...FO_LEVEL1_STATEMENTS, ...FO_LEVEL2_STATEMENTS]) {
    if (statement.category === 'fact') {
      assert.equal(genericHomepages.has(statement.sourceUrl), false, statement.id)
    }
  }
})

test('доросла лексика прибрана з пояснень', () => {
  const banned = /когнітивн|причинно-наслідков|суб'єктивн|індивідуальн|преференц/i
  for (const s of ALL) assert.ok(!banned.test(s.explanation), `${s.id}: ${s.explanation}`)
})

test('pickFoRound: збалансований раунд без повторів', () => {
  const round = pickFoRound(FO_LEVEL2_STATEMENTS, 10)
  assert.equal(round.length, 10)
  assert.equal(new Set(round.map(s => s.id)).size, 10)
  const cats = new Set(round.map(s => s.category))
  assert.ok(cats.size >= 2, 'раунд має містити принаймні дві категорії')
})
