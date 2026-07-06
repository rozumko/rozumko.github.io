/**
 * Час, що лишився для спроби, у секундах.
 *
 * Дедлайн — це РАНІШЕ з двох:
 *   • старт спроби + ліміт часу події + накопичена пауза
 *     (attempt.started_at + event.time_minutes + attempt.paused_seconds);
 *   • жорсткий кінець події (event.ends_at) — пауза НЕ виносить за цей стелю.
 *
 * Спільна логіка для student- та attempt-роутів (не дублювати).
 */
export function getRemainingSeconds(
  startedAt: Date | null,
  timeMinutes: number,
  endsAt: Date,
  now = new Date(),
  pausedSeconds = 0,
): number {
  const base = startedAt?.getTime() ?? now.getTime()
  const attemptDeadline = base + timeMinutes * 60_000 + pausedSeconds * 1000
  const deadline = Math.min(attemptDeadline, endsAt.getTime())
  return Math.max(0, Math.ceil((deadline - now.getTime()) / 1000))
}

/**
 * Grace для блекаутів: сумарний ліміт паузи на спробу (секунди).
 * Мотивація — перебої зі світлом в Україні (роутер від генератора 5–10 хв).
 */
export const GRACE_CAP_SECONDS = 600 // 10 хв

/**
 * Поріг «розриву»: heartbeat нормально приходить кожні ~15с. Розрив ≤ порогу —
 * звичайне тремтіння мережі/тротлінг вкладки, паузу не кредитуємо. Розрив >
 * порогу — реальний офлайн, кредитуємо.
 */
export const PAUSE_IDLE_THRESHOLD_SECONDS = 45

/**
 * Скільки паузи має бути в спроби ПІСЛЯ цього heartbeat.
 *
 * Розрив міряє СЕРВЕР (now − last_seen_at), а не клієнт — тож учень не може
 * «домалювати» собі час звітом. Кредитуємо повний розрив, обмежений залишком
 * grace-бюджету. Перший heartbeat (last_seen_at = null) нічого не кредитує.
 *
 * Чиста функція — тестується без БД.
 */
export function creditPauseSeconds(
  prevPausedSeconds: number,
  lastSeenAt: Date | null,
  now = new Date(),
  cap = GRACE_CAP_SECONDS,
  threshold = PAUSE_IDLE_THRESHOLD_SECONDS,
): number {
  if (!lastSeenAt) return prevPausedSeconds
  const gapSeconds = Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000)
  if (gapSeconds <= threshold) return prevPausedSeconds
  return Math.min(prevPausedSeconds + gapSeconds, cap)
}
