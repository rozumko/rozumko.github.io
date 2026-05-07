export const EVENT_STATUS_LABELS = {
  draft: 'Чернетка',
  published: 'Опубліковано',
  active: 'Активна',
  finished: 'Завершена',
  archived: 'Архів',
}

export function toDateTimeLocalValue(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function dateTimeLocalToIso(value) {
  return new Date(value).toISOString()
}

export function buildEventPayload({
  title,
  startsAt,
  endsAt,
  status = 'draft',
}) {
  return {
    title: title.trim(),
    startsAt: dateTimeLocalToIso(startsAt),
    endsAt: dateTimeLocalToIso(endsAt),
    status,
  }
}

export function formatEventDate(value) {
  return new Date(value).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function countActiveEvents(events) {
  return events.filter(event => event.status === 'active').length
}

export function countSelectedQuestions(questionIds) {
  return new Set(questionIds).size
}
