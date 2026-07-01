// Чиста логіка підсумку місії School Mode — без DOM, легко тестується.
// School Mode анонімний: результат живе лише в памʼяті сторінки, нікуди не пишеться.

export interface MissionSummary {
  correct: number
  total: number
  percent: number
}

/**
 * Підсумок місії: correct/total + цілий відсоток (0..100).
 * Захищено від total=0 (ділення на нуль) і correct поза межами [0, total].
 */
export function missionSummary(correct: number, total: number): MissionSummary {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  const safeCorrect = Number.isFinite(correct)
    ? Math.max(0, Math.min(Math.floor(correct), safeTotal))
    : 0
  const percent = safeTotal === 0 ? 0 : Math.round((safeCorrect / safeTotal) * 100)
  return { correct: safeCorrect, total: safeTotal, percent }
}

/** Дитяче підбадьорення за відсотком (без тиску й оцінок). */
export function encouragement(percent: number): string {
  if (percent >= 90) return 'Неймовірно! Ти справжній майстер мислення! 🏆'
  if (percent >= 70) return 'Чудова робота! Так тримати! 🌟'
  if (percent >= 40) return 'Гарний старт! Ще трохи практики — і буде супер! 💪'
  return 'Головне — ти спробував! Зіграймо ще раз? 🚀'
}
