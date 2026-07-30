/**
 * Прибирає ключі відповідей з options перед відправкою питання в браузер.
 *
 * Для типів sort/match/input ключ правильної відповіді лежить УСЕРЕДИНІ options:
 *   sort  → options.correctOrder   (number[])
 *   match → options.pairs          (number[])
 *   input → options.answer         (string|number)
 * Ці поля НІКОЛИ не повинні потрапляти в браузер для олімпіадних питань —
 * інакше дитина (або скрипт) бачить правильну відповідь у DevTools / мережі.
 *
 * Поля, потрібні для рендеру (items, left, right, given, choices, inputType),
 * лишаються. choice/truefalse/sequence тримають ключ у колонці `correct`
 * (вона стрипається окремо), тож їхні options не містять відповіді.
 */
const SECRET_OPTION_KEYS = ['correctOrder', 'pairs', 'answer'] as const

export function stripOptionKeys(options: unknown): unknown {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return options
  }
  const clone: Record<string, unknown> = { ...(options as Record<string, unknown>) }
  for (const key of SECRET_OPTION_KEYS) delete clone[key]
  return clone
}

/** Top-level answer and editorial columns. Never serialise these to a student. */
const PRIVATE_COLUMNS = ['correct', 'explanation', 'meta'] as const

type PublicImageRole = 'essential' | 'supportive' | 'decorative'

function readPublicImageRole(meta: unknown): PublicImageRole | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined
  const role = (meta as Record<string, unknown>).imageRole
  return role === 'essential' || role === 'supportive' || role === 'decorative'
    ? role
    : undefined
}

/**
 * Санітизує одне питання для олімпіадного режиму: стрипає options-ключі
 * і колонки з відповіддю.
 *
 * `correct`/`explanation` теж знімаються тут, а не лише через проєкцію SELECT
 * на боці виклику. Раніше безпека трималася на домовленості: жоден call-site
 * не селектить ці колонки. Додавання одного поля до SELECT мовчки віддало б
 * ключі в браузер — санітайзер їх пропускав.
 */
export function sanitizeOlympiadQuestion<T extends { options: unknown }>(q: T): T {
  const clone: Record<string, unknown> = { ...q, options: stripOptionKeys(q.options) }
  const imageRole = readPublicImageRole(clone.meta)
  for (const key of PRIVATE_COLUMNS) delete clone[key]
  if (imageRole) clone.imageRole = imageRole
  return clone as T
}
