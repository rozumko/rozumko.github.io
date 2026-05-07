export const PAYMENT_STATUSES = ['not_required', 'pending', 'paid', 'failed', 'refunded'] as const

export type PaymentStatus = typeof PAYMENT_STATUSES[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type TeacherClassInput = {
  name?: string
  grade?: number
}

export type NormalizedTeacherClassInput = {
  name: string
  grade: number
}

export type RegistrationInput = {
  eventId?: string
  classId?: string
  participantsCount?: number
  paymentStatus?: string
}

export type NormalizedRegistrationInput = {
  eventId: string
  classId: string
  participantsCount: number
  paymentStatus: PaymentStatus
}

export function normalizeTeacherClassInput(input: TeacherClassInput): NormalizedTeacherClassInput {
  const name = input.name?.trim() ?? ''
  if (!name) throw new Error('Назва класу обовʼязкова')
  if (name.length > 80) throw new Error('Назва класу надто довга')

  const grade = Number(input.grade)
  if (!Number.isInteger(grade) || grade < 1 || grade > 4) {
    throw new Error('Клас має бути числом від 1 до 4')
  }

  return { name, grade }
}

export function normalizeRegistrationInput(input: RegistrationInput): NormalizedRegistrationInput {
  const eventId = input.eventId?.trim() ?? ''
  const classId = input.classId?.trim() ?? ''
  if (!UUID_RE.test(eventId)) throw new Error('Некоректний id події')
  if (!UUID_RE.test(classId)) throw new Error('Некоректний id класу')

  const participantsCount = Number(input.participantsCount)
  if (!Number.isInteger(participantsCount) || participantsCount < 1 || participantsCount > 100) {
    throw new Error('Кількість учасників має бути від 1 до 100')
  }

  const paymentStatus = input.paymentStatus ?? 'not_required'
  if (!PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)) {
    throw new Error('Некоректний статус оплати')
  }

  return {
    eventId,
    classId,
    participantsCount,
    paymentStatus: paymentStatus as PaymentStatus,
  }
}

export function assertEventCanAcceptRegistrations(
  event: { status: string; endsAt: Date },
  now = new Date()
): void {
  if (!['published', 'active'].includes(event.status)) {
    throw new Error('Реєстрація доступна тільки для опублікованої або активної події')
  }
  if (event.endsAt < now) {
    throw new Error('Реєстрація на цю подію вже недоступна')
  }
}
