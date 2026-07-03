import { randomInt } from 'crypto'

// ── Просунутий School Mode: валідація вводу (чисті функції, без I/O) ──────────

// Allowlist аватарів. Аватар — суто візуальна мітка сесії, НЕ ідентифікатор дитини.
// Слаги мапляться на ілюстрації public/avatars/<slug>.png (див. optimize-images).
export const SCHOOL_AVATARS = [
  'astronaut', 'wizard', 'detective', 'explorer', 'gamer',
  'hero', 'ninja', 'pirat', 'princess', 'artist',
] as const

export function isValidAvatar(avatar: unknown): avatar is string {
  return typeof avatar === 'string' && (SCHOOL_AVATARS as readonly string[]).includes(avatar)
}

// Нік — довільна коротка мітка. НЕ вимагаємо справжнього імені (жодних PII).
// Керуючі символи (\p{Cc}) прибираємо, пробіли згортаємо, довжину обмежуємо.
// Звичайні пробіли й дефіси в імені зберігаємо ("Маша К", "Ана-Марія").
export function normalizeNickname(raw: unknown): string {
  const cleaned = String(raw ?? '')
    .replace(/\p{Cc}/gu, ' ') // керуючі символи -> пробіл
    .replace(/\s+/g, ' ')     // згорнути пробіли
    .trim()
  if (!cleaned) throw new Error('Введи імʼя або прізвисько')
  if (cleaned.length > 20) throw new Error('Задовге прізвисько (макс. 20 символів)')
  return cleaned
}

// Код приєднання — 6-значний PIN (як Kahoot). Простий для дітей, легко ввести.
export const JOIN_CODE_RE = /^\d{6}$/

export function validateJoinCodeFormat(code: string): void {
  if (!JOIN_CODE_RE.test(code)) {
    throw new Error('Невірний формат коду. Введи 6 цифр.')
  }
}

// crypto.randomInt — не передбачуваний RNG. Унікальність гарантує UNIQUE у БД
// (при колізії роут повторює генерацію).
export function generateJoinCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

// Дозволені складності для сесії (null = будь-яка).
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

export function normalizeDifficulty(raw: unknown): 'easy' | 'medium' | 'hard' | null {
  if (raw == null || raw === '') return null
  if ((DIFFICULTIES as readonly string[]).includes(String(raw))) {
    return raw as 'easy' | 'medium' | 'hard'
  }
  throw new Error('Невідома складність')
}
