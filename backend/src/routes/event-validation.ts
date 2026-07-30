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

const LOCKED_EVENT_RULE_FIELDS = ['startsAt', 'endsAt', 'timeMinutes', 'questionsCount'] as const

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

export function assertEventRuleChangesAllowed(isLocked: boolean, patch: Record<string, unknown>): void {
  if (isLocked && LOCKED_EVENT_RULE_FIELDS.some(field => patch[field] !== undefined)) {
    throw new Error('Не можна змінювати час або кількість питань активної олімпіади чи події з незавершеними спробами')
  }
}

const EVENT_STATUS_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ['published', 'active', 'archived'],
  published: ['active', 'archived'],
  active: ['finished', 'archived'],
  finished: ['archived'],
  archived: [],
}

export function assertEventStatusTransitionAllowed(current: string, next: string): void {
  if (current === next) return
  if (
    !EVENT_STATUSES.includes(current as EventStatus)
    || !EVENT_STATUSES.includes(next as EventStatus)
    || !EVENT_STATUS_TRANSITIONS[current as EventStatus].includes(next as EventStatus)
  ) {
    throw new Error('Після публікації олімпіаду не можна повертати в чернетку або розморожувати її набір питань')
  }
}

export function shouldValidateEventReadiness(
  currentStatus: string,
  requestedStatus: string | undefined,
): boolean {
  return requestedStatus !== undefined
    && requestedStatus !== currentStatus
    && (requestedStatus === 'published' || requestedStatus === 'active')
}

export function assertEventQuestionSelectionAllowed(status: string, hasInProgressAttempt: boolean): void {
  if (status !== 'draft' || hasInProgressAttempt) {
    throw new Error('Набір питань можна змінювати лише в чернетці без незавершених спроб')
  }
}
