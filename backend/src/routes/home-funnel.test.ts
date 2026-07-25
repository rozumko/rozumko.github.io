import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  HOME_FUNNEL_STEPS, HOME_FUNNEL_TRACK_NONE, HOME_FUNNEL_GRADE_UNKNOWN,
  normalizeFunnelKey, summarizeFunnel,
} from './home-funnel.js'

// Межа приватності воронки. Головний інваріант: відкритий роут не може
// створити нового виміру, а сховище не тримає нічого індивідуального.

test('funnel key rejects any step outside the allowlist', () => {
  for (const step of ['', 'unknown_step', 'home_open ', 'HOME_OPEN', 'parent_email']) {
    assert.throws(() => normalizeFunnelKey({ step }), /крок/i, `крок «${step}» прийнято`)
  }
  assert.throws(() => normalizeFunnelKey({}), /крок/i)
})

test('funnel key rejects grades and tracks outside the allowlist', () => {
  for (const grade of [0, 5, -1, 1.5, '2', {}]) {
    assert.throws(() => normalizeFunnelKey({ step: 'home_open', grade }), /клас/i, `клас ${String(grade)} прийнято`)
  }
  for (const track of ['', 'school', 'informatics ', 42]) {
    assert.throws(() => normalizeFunnelKey({ step: 'home_open', track }), /напрям/i, `напрям «${String(track)}» прийнято`)
  }
})

test('funnel key falls back to non-identifying defaults', () => {
  const key = normalizeFunnelKey({ step: 'home_open' })
  assert.deepEqual(key, { step: 'home_open', grade: HOME_FUNNEL_GRADE_UNKNOWN, track: HOME_FUNNEL_TRACK_NONE })

  const full = normalizeFunnelKey({ step: 'practice_start', grade: 2, track: 'ai-basics' })
  assert.deepEqual(full, { step: 'practice_start', grade: 2, track: 'ai-basics' })
})

test('funnel summary keeps the canonical step order and reports empty steps', () => {
  const summary = summarizeFunnel([
    { step: 'practice_start', count: 30 },
    { step: 'home_open', count: 100 },
    { step: 'home_open', count: 20 },
    { step: 'not-a-step', count: 999 },
  ])

  assert.deepEqual(summary.map(s => s.step), [...HOME_FUNNEL_STEPS])
  assert.equal(summary[0].count, 120, 'рядки одного кроку мають складатися')
  assert.equal(summary.find(s => s.step === 'parent_lead')?.count, 0, 'порожній крок має лишатися у звіті')
  assert.equal(summary.find(s => s.step === 'not-a-step' as never), undefined)
})

test('funnel summary computes conversion against the previous step only', () => {
  const summary = summarizeFunnel([
    { step: 'home_open', count: 200 },
    { step: 'path_start', count: 50 },
    { step: 'practice_start', count: 100 },
  ])

  assert.equal(summary[0].conversionFromPrev, null, 'перший крок не має від чого конвертувати')
  assert.equal(summary[1].conversionFromPrev, 0.25)
  assert.equal(summary[2].conversionFromPrev, 2)
  // Ділення на нуль не має давати Infinity/NaN у звіті адміна.
  const zeroed = summarizeFunnel([{ step: 'practice_complete', count: 5 }])
  for (const row of zeroed) {
    assert.ok(row.conversionFromPrev === null || Number.isFinite(row.conversionFromPrev))
  }
})

test('the funnel store holds aggregates, never per-visitor rows', () => {
  const migration = readFileSync(new URL('../../drizzle/0045_add_home_funnel_counters.sql', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../../drizzle/meta/_journal.json', import.meta.url), 'utf8')

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.home_funnel_counters/)
  assert.match(migration, /ALTER TABLE public\.home_funnel_counters ENABLE ROW LEVEL SECURITY;/)
  assert.match(migration, /PRIMARY KEY \(bucket_date, step, grade, track\)/)
  assert.match(journal, /"tag": "0045_add_home_funnel_counters"/)

  // Жодної колонки, що ідентифікує відвідувача або звужує агрегат до особи.
  // Перевіряємо DDL, не коментарі: коментар якраз і пояснює, чого тут немає.
  const ddl = migration.replace(/^\s*--.*$/gm, '')
  for (const forbidden of [
    'ip', 'user_agent', 'session', 'visitor', 'client_id', 'device',
    'email', 'lead_id', 'child_profile_id', 'fingerprint', 'referrer',
  ]) {
    assert.doesNotMatch(
      ddl,
      new RegExp(`\\b${forbidden}\\b`, 'i'),
      `міграція воронки згадує ідентифікатор «${forbidden}»`,
    )
  }
})

test('the funnel write route stays open, keyless and non-identifying', () => {
  const route = readFileSync(new URL('./home.ts', import.meta.url), 'utf8')
  const funnelRoute = route.match(/app\.post<[\s\S]*?>\('\/funnel'[\s\S]*?\n  \}\)/)?.[0] ?? ''
  assert.ok(funnelRoute, 'роут POST /funnel не знайдено')

  assert.match(funnelRoute, /rateLimit/, 'відкритий лічильник має бути rate-limited')
  assert.match(funnelRoute, /schema: \{ body: funnelBody \}/)
  // Роут не має права читати мережеві ідентифікатори відвідувача.
  assert.doesNotMatch(funnelRoute, /req\.(ip|ips)\b/)
  assert.doesNotMatch(funnelRoute, /user-agent|userAgent/i)
  assert.doesNotMatch(funnelRoute, /req\.headers/)

  const body = route.match(/const funnelBody = \{[\s\S]*?\} as const/)?.[0] ?? ''
  assert.ok(body, 'схему funnelBody не знайдено')
  assert.match(body, /additionalProperties: false/)
  assert.deepEqual(
    [...body.matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]).sort(),
    ['grade', 'step', 'track'],
    'тіло воронки приймає більше полів, ніж крок/клас/напрям',
  )
})
