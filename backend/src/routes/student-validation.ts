import { createHmac, timingSafeEqual } from 'crypto'

// ── Формат коду учня ──────────────────────────────────────────
// Приклад: КІТ2470  (2–5 укр. літери + 3–4 цифри, або навпаки).
// 3 цифри лишаються валідними для зворотної сумісності зі старими кодами;
// нові коди генеруються з 4 цифрами для більшого простору перебору.
// Тільки кирилиця + цифри — без англ. літер і спецсимволів (зручно дітям).
export const CODE_RE = /^([А-ЯҐЄІЇ]{2,5}\d{3,4}|\d{3,4}[А-ЯҐЄІЇ]{2,5})$/u

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function validateCodeFormat(code: string): void {
  if (!CODE_RE.test(code)) {
    throw new Error('Невірний формат коду. Приклад: КІТ247')
  }
}

// ── HMAC attempt token ────────────────────────────────────────
// Читаємо секрет lazy (при першому виклику), щоб dotenv встиг завантажитись
function getAttemptSecret(): string {
  const secret = process.env.ATTEMPT_SECRET
  if (!secret) throw new Error('ATTEMPT_SECRET environment variable is not set')
  return secret
}

export function generateAttemptToken(attemptId: string): string {
  return createHmac('sha256', getAttemptSecret()).update(attemptId).digest('hex')
}

export function verifyAttemptToken(attemptId: string, token: string): boolean {
  const expected = Buffer.from(generateAttemptToken(attemptId), 'hex')
  try {
    const actual = Buffer.from(token, 'hex')
    if (actual.length !== expected.length) return false
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

// ── Мітка учня у класі ────────────────────────────────────────
export function normalizeStudentLabel(raw: unknown): string {
  const label = String(raw ?? '').trim()
  if (!label) throw new Error('Мітка учня не може бути порожньою')
  if (label.length > 60) throw new Error('Мітка учня не може перевищувати 60 символів')
  return label
}
