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

/** Санітизує одне питання для олімпіадного режиму: стрипає options-ключі. */
export function sanitizeOlympiadQuestion<T extends { options: unknown }>(q: T): T {
  return { ...q, options: stripOptionKeys(q.options) }
}
