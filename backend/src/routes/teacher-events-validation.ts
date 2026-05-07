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
