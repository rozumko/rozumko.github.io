export const EVENT_STATUSES = ['draft', 'published', 'active', 'finished', 'archived'] as const

export type EventStatus = typeof EVENT_STATUSES[number]

export type EventInput = {
  title?: string
  description?: string | null
  startsAt?: string
  endsAt?: string
  status?: string
}

export type NormalizedEventInput = {
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  status: EventStatus
}

export type EventPatchInput = Partial<EventInput>

export type NormalizedEventPatch = Partial<NormalizedEventInput> & {
  updatedAt: Date
}

function parseDate(value: string | undefined, field: string): Date {
  if (!value) throw new Error(`Поле ${field} обов'язкове`)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Поле ${field} має бути коректною датою`)
  return date
}

function normalizeStatus(status: string | undefined): EventStatus {
  const value = status ?? 'draft'
  if (!EVENT_STATUSES.includes(value as EventStatus)) {
    throw new Error('Невірний статус події')
  }
  return value as EventStatus
}

function normalizeTitle(title: string | undefined): string {
  const value = title?.trim() ?? ''
  if (!value) throw new Error('Назва події обовʼязкова')
  if (value.length > 160) throw new Error('Назва події надто довга')
  return value
}

function normalizeDescription(description: string | null | undefined): string | null {
  const value = description?.trim() ?? ''
  return value || null
}

export function normalizeEventInput(input: EventInput): NormalizedEventInput {
  const startsAt = parseDate(input.startsAt, 'startsAt')
  const endsAt = parseDate(input.endsAt, 'endsAt')
  if (startsAt >= endsAt) {
    throw new Error('Дата завершення має бути пізніше дати початку')
  }

  return {
    title: normalizeTitle(input.title),
    description: normalizeDescription(input.description),
    startsAt,
    endsAt,
    status: normalizeStatus(input.status),
  }
}

export function normalizeEventPatch(input: EventPatchInput): NormalizedEventPatch {
  const patch: NormalizedEventPatch = { updatedAt: new Date() }

  if (input.title !== undefined) patch.title = normalizeTitle(input.title)
  if (input.description !== undefined) patch.description = normalizeDescription(input.description)
  if (input.status !== undefined) patch.status = normalizeStatus(input.status)
  if (input.startsAt !== undefined) patch.startsAt = parseDate(input.startsAt, 'startsAt')
  if (input.endsAt !== undefined) patch.endsAt = parseDate(input.endsAt, 'endsAt')

  if (patch.startsAt && patch.endsAt && patch.startsAt >= patch.endsAt) {
    throw new Error('Дата завершення має бути пізніше дати початку')
  }

  return patch
}

export function assertEventDateOrder(startsAt: Date, endsAt: Date): void {
  if (startsAt >= endsAt) {
    throw new Error('Дата завершення має бути пізніше дати початку')
  }
}
