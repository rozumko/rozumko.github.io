import { HOME_DEMO_TRACKS } from './home-validation.js'

// Home funnel — знеособлені лічильники кроків воронки (без I/O, unit-testable).
//
// Межа приватності (docs/security-model.md, docs/home-demo-contract.md):
// до згоди батька НЕ зберігається нічого індивідуального. Тому сховище тримає
// агрегати `дата × крок × клас × напрям → лічильник`, а не події: немає рядка
// на відвідувача, немає ідентифікатора сесії, IP чи User-Agent. Відновити з
// цих даних шлях однієї дитини неможливо за побудовою — саме тому таблиця
// зветься `home_funnel_counters`, а не `..._events`.
//
// Наслідок, який треба знати при читанні цифр: лічильники показують НАПРЯМОК
// (скільки разів крок стався), а не унікальних людей. Один відвідувач, що
// відкрив дві вкладки, дає два `home_open`. Для рішень «де відвалюється
// воронка» цього достатньо; для когортного аналізу — ні, і це свідомий обмін
// на користь приватності.

export const HOME_FUNNEL_STEPS = [
  'home_open',
  'path_start',
  'practice_start',
  'practice_complete',
  'parent_gate_view',
  'parent_lead',
] as const

export type HomeFunnelStep = typeof HOME_FUNNEL_STEPS[number]

/** Крок без напряму (відкриття сторінки, карта) пишеться з цим значенням. */
export const HOME_FUNNEL_TRACK_NONE = 'none'

export const HOME_FUNNEL_TRACKS = [HOME_FUNNEL_TRACK_NONE, ...HOME_DEMO_TRACKS] as const

/** Клас невідомий (дитина ще не обрала) — 0, щоб ключ лишався NOT NULL. */
export const HOME_FUNNEL_GRADE_UNKNOWN = 0

export interface HomeFunnelKey {
  step: HomeFunnelStep
  grade: number
  track: string
}

export interface HomeFunnelRow {
  step: string
  count: number
}

export interface HomeFunnelStepSummary {
  step: HomeFunnelStep
  count: number
  /** Частка від попереднього непорожнього кроку, 0–1; null для першого. */
  conversionFromPrev: number | null
}

function isStep(raw: unknown): raw is HomeFunnelStep {
  return typeof raw === 'string' && (HOME_FUNNEL_STEPS as readonly string[]).includes(raw)
}

/**
 * Нормалізує ключ лічильника. Кидає на будь-якому значенні поза allowlist —
 * відкритий роут не має права створювати нові виміри з тіла запиту.
 */
export function normalizeFunnelKey(raw: { step?: unknown; grade?: unknown; track?: unknown }): HomeFunnelKey {
  if (!isStep(raw.step)) throw new Error('Невідомий крок воронки')

  let grade = HOME_FUNNEL_GRADE_UNKNOWN
  if (raw.grade !== undefined && raw.grade !== null) {
    if (typeof raw.grade !== 'number' || !Number.isInteger(raw.grade) || raw.grade < 1 || raw.grade > 4) {
      throw new Error('Невірний клас')
    }
    grade = raw.grade
  }

  let track: string = HOME_FUNNEL_TRACK_NONE
  if (raw.track !== undefined && raw.track !== null) {
    if (typeof raw.track !== 'string' || !(HOME_FUNNEL_TRACKS as readonly string[]).includes(raw.track)) {
      throw new Error('Невідомий напрям')
    }
    track = raw.track
  }

  return { step: raw.step, grade, track }
}

/**
 * Складає агреговані рядки у воронку в канонічному порядку кроків.
 * Кроки без жодного запису лишаються з нулем — «нуль» теж є відповіддю,
 * і мовчазне зникнення кроку зі звіту читалося б як «все добре».
 */
export function summarizeFunnel(rows: HomeFunnelRow[]): HomeFunnelStepSummary[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (!isStep(row.step)) continue
    totals.set(row.step, (totals.get(row.step) ?? 0) + row.count)
  }

  let prev: number | null = null
  return HOME_FUNNEL_STEPS.map(step => {
    const count = totals.get(step) ?? 0
    const conversionFromPrev = prev === null || prev === 0 ? null : count / prev
    prev = count
    return { step, count, conversionFromPrev }
  })
}
