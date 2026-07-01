export type TeacherEventWindow = {
  status: string
  startsAt: Date
  endsAt: Date
}

export function assertEventCanIssueCodes(event: TeacherEventWindow, now = new Date()): void {
  if (event.status !== 'active') {
    throw new Error('Коди можна генерувати тільки для активної олімпіади')
  }
  if (event.startsAt > now) {
    throw new Error('Олімпіада ще не почалась')
  }
  if (event.endsAt < now) {
    throw new Error('Олімпіада вже завершилась')
  }
}

/**
 * Термін дії коду учня (TTL).
 *
 * Код не має сенсу після кінця події: після `endsAt` відповіді не приймаються,
 * а відновлення спроби неможливе. Тож замість «ніколи не протухає»:
 *   • дефолт (учитель не задав) → `expiresAt = endsAt`;
 *   • якщо задано → не пізніше `endsAt` (clamp).
 *
 * Це обмежує вікно перебору масового коду навіть якщо про TTL забули, і не дає
 * коду пережити подію. Некоректна дата від клієнта → безпечний дефолт `endsAt`.
 */
export function resolveCodeExpiry(provided: string | undefined, eventEndsAt: Date): Date {
  if (!provided) return eventEndsAt
  const parsed = new Date(provided)
  if (Number.isNaN(parsed.getTime())) return eventEndsAt
  return parsed < eventEndsAt ? parsed : eventEndsAt
}
