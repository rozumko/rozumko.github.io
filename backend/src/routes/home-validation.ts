import { createHmac, timingSafeEqual } from 'node:crypto'

// Home Mode — чиста валідація та генерація звіту (без I/O, unit-testable).
// Контракт: docs/home-demo-contract.md. Довірений скоринг — лише на сервері.

export const HOME_DEMO_TRACKS = ['informatics', 'computational-thinking', 'ai-basics'] as const
export type HomeDemoTrack = typeof HOME_DEMO_TRACKS[number]

export function isValidTrack(raw: unknown): raw is HomeDemoTrack {
  return typeof raw === 'string' && (HOME_DEMO_TRACKS as readonly string[]).includes(raw)
}

// ── Parent lead ───────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeParentEmail(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Вкажіть email')
  const email = raw.trim().toLowerCase()
  if (email.length < 6 || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new Error('Невірний формат email')
  }
  return email
}

export function normalizeChildDisplayName(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string') throw new Error('Невірне імʼя профілю')
  // Керуючі символи (коди < 32 та 127) вирізаємо, пробіли згортаємо.
  const name = Array.from(raw).filter(ch => { const c = ch.charCodeAt(0); return c >= 32 && c !== 127 }).join('').replace(/\s+/g, ' ').trim()
  if (!name) return null
  if (name.length > 40) throw new Error('Імʼя профілю задовге (макс. 40 символів)')
  return name
}

export function validateConsent(consent: { policyVersion: string; acceptedAt: string }): void {
  if (!consent.policyVersion.trim()) throw new Error('Не вказано версію політики конфіденційності')
  if (Number.isNaN(Date.parse(consent.acceptedAt))) throw new Error('Невірна дата згоди')
}

// ── Lead token ────────────────────────────────────────────────
// HMAC із доменним префіксом: токен ліда для UUID X ніколи не збігається
// з attempt/participant-токеном того самого UUID (без плутанини токенів).
const LEAD_TOKEN_DOMAIN = 'home-lead:'

function getAttemptSecret(): string {
  const secret = process.env.ATTEMPT_SECRET
  if (!secret) throw new Error('ATTEMPT_SECRET is not set')
  return secret
}

export function generateLeadToken(leadId: string): string {
  return createHmac('sha256', getAttemptSecret()).update(LEAD_TOKEN_DOMAIN + leadId).digest('hex')
}

export function verifyLeadToken(leadId: string, token: string): boolean {
  const expected = Buffer.from(generateLeadToken(leadId), 'hex')
  try {
    const actual = Buffer.from(token, 'hex')
    if (actual.length !== expected.length) return false
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

// ── Події демо-спроби ─────────────────────────────────────────
export interface DemoAttemptEvent {
  questionId: string
  answer: number | string | number[]
  timeToAnswerMs: number
  answerChangeCount: number
  position: number
}

/** Структурні інваріанти, які не покриває JSON-схема роуту. */
export function validateDemoEvents(events: DemoAttemptEvent[]): void {
  const seen = new Set<string>()
  for (const e of events) {
    if (seen.has(e.questionId)) throw new Error('Дубльоване питання у подіях спроби')
    seen.add(e.questionId)
  }
  const positions = new Set(events.map(e => e.position))
  if (positions.size !== events.length) throw new Error('Дубльована позиція у подіях спроби')
}

// ── Генерація батьківського звіту (v1) ────────────────────────
// Кореляція подій із СЕРВЕРНИМ isCorrect. Клієнтська "правильність"
// сюди не потрапляє ніколи (схема роуту її взагалі відхиляє).

export const DEMO_REPORT_VERSION = 1

export interface ScoredDemoItem {
  questionId: string
  position: number
  isCorrect: boolean
  timeToAnswerMs: number
  answerChangeCount: number
}

export interface DemoReport {
  missionId: string
  missionVersion: number
  track: HomeDemoTrack
  correct: number
  total: number
  strengths: string[]
  struggles: string[]
  patterns: Array<{ kind: 'haste' | 'attention'; evidence: string }>
  nextMission: { missionId: string; reason: string }
}

const TRACK_LABELS: Record<HomeDemoTrack, string> = {
  'informatics': 'інформатики',
  'computational-thinking': 'обчислювального мислення',
  'ai-basics': 'основ ШІ',
}

// Порогові евристики v1. Свідомо консервативні: патерн згадуємо лише
// коли є ≥2 підтвердження, щоб звіт не звинувачував дитину за один клік.
const HASTE_MS = 7000
const HASTE_MIN_COUNT = 2
const CHANGES_UNSURE = 2
const UNSURE_MIN_COUNT = 2

export function buildDemoReport(
  items: ScoredDemoItem[],
  meta: { missionId: string; missionVersion: number; track: HomeDemoTrack },
): DemoReport {
  const total = items.length
  const correct = items.filter(i => i.isCorrect).length
  const trackLabel = TRACK_LABELS[meta.track]

  const strengths: string[] = []
  const struggles: string[] = []
  if (correct === total && total > 0) {
    strengths.push(`Впевнено виконує завдання з ${trackLabel} свого рівня.`)
  } else if (correct >= Math.ceil(total * 0.6)) {
    strengths.push(`Більшість завдань з ${trackLabel} виконує самостійно.`)
  }
  const slowCorrect = items.filter(i => i.isCorrect && i.timeToAnswerMs >= HASTE_MS).length
  if (slowCorrect >= 2) {
    strengths.push('Не поспішає: обмірковує завдання перед відповіддю.')
  }
  if (correct < total) {
    struggles.push(`Помиляється у частині завдань з ${trackLabel} — це нормальна зона росту.`)
  }

  const patterns: DemoReport['patterns'] = []
  const hasteCount = items.filter(i => !i.isCorrect && i.timeToAnswerMs < HASTE_MS).length
  if (hasteCount >= HASTE_MIN_COUNT) {
    patterns.push({
      kind: 'haste',
      evidence: `${hasteCount} помилки зроблені за лічені секунди — схоже на поспіх, а не на брак розуміння.`,
    })
  }
  const unsureCount = items.filter(i => i.answerChangeCount >= CHANGES_UNSURE).length
  if (unsureCount >= UNSURE_MIN_COUNT) {
    patterns.push({
      kind: 'attention',
      evidence: `У ${unsureCount} завданнях відповідь змінювалась кілька разів — варто тренувати уважне читання умови.`,
    })
  }

  const nextMission = patterns.some(p => p.kind === 'haste')
    ? { missionId: `${meta.track}-attention-1`, reason: 'Місія з акцентом на уважне читання умови перед відповіддю.' }
    : { missionId: `${meta.track}-practice-1`, reason: `Наступний крок регулярної практики з ${trackLabel}.` }

  return {
    missionId: meta.missionId,
    missionVersion: meta.missionVersion,
    track: meta.track,
    correct,
    total,
    strengths,
    struggles,
    patterns,
    nextMission,
  }
}
