import type { OlympiadEvent, OlympiadEventInput } from '../api/client.js'

export const EVENT_STATUS_LABELS: Record<OlympiadEvent['status'], string> = {
  draft:     'Чернетка',
  published: 'Опубліковано',
  active:    'Активна',
  finished:  'Завершена',
  archived:  'Архів',
}

export function toDateTimeLocalValue(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function dateTimeLocalToIso(value: string): string {
  return new Date(value).toISOString()
}

export function buildEventPayload({
  title, startsAt, endsAt, status = 'draft',
}: { title: string; startsAt: string; endsAt: string; status?: OlympiadEvent['status'] }): OlympiadEventInput {
  return {
    title: title.trim(),
    startsAt: dateTimeLocalToIso(startsAt),
    endsAt:   dateTimeLocalToIso(endsAt),
    status,
  }
}

export function formatEventDate(value: string): string {
  return new Date(value).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function countActiveEvents(events: Pick<OlympiadEvent, 'status'>[]): number {
  return events.filter(e => e.status === 'active').length
}

export function countSelectedQuestions(questionIds: string[]): number {
  return new Set(questionIds).size
}
