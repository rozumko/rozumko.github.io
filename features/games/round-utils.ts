// Спільні дрібниці раундових ігор (sequence, scenarios). Історичні рушії
// (fact-opinion, sorting) мають власні копії — свідомо не рефакторимо їх
// у цьому зрізі, щоб не розширювати діф; нові ігри беруть звідси.

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Зірки раунду: все правильно з першої спроби — 3, ≥75% — 2, інакше 1. */
export function starsFor(correct: number, total: number): number {
  if (correct >= total) return 3
  if (correct >= Math.ceil(total * 0.75)) return 2
  return 1
}

export interface RoundSummary {
  correct: number
  total: number
  stars: number
}

/** Перемішаний порядок індексів, який гарантовано НЕ збігається з правильним
 * (інакше набір «впорядкуй кроки» розв'язався б сам). */
export function shuffledOrder(size: number): number[] {
  if (size < 2) return Array.from({ length: size }, (_, i) => i)
  let order = Array.from({ length: size }, (_, i) => i)
  do {
    order = shuffle(order)
  } while (order.every((value, index) => value === index))
  return order
}
