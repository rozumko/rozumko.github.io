/**
 * Час, що лишився для спроби, у секундах.
 *
 * Дедлайн — це РАНІШЕ з двох:
 *   • старт спроби + ліміт часу події (attempt.started_at + event.time_minutes);
 *   • жорсткий кінець події (event.ends_at).
 *
 * Спільна логіка для student- та attempt-роутів (не дублювати).
 */
export function getRemainingSeconds(
  startedAt: Date | null,
  timeMinutes: number,
  endsAt: Date,
  now = new Date(),
): number {
  const attemptDeadline = (startedAt?.getTime() ?? now.getTime()) + timeMinutes * 60_000
  const deadline = Math.min(attemptDeadline, endsAt.getTime())
  return Math.max(0, Math.ceil((deadline - now.getTime()) / 1000))
}
