// Спільні дані таксономії живуть у features/missions/topics.ts (нейтральний
// модуль, яким користуються і публічні сторінки). Тут — ре-експорт + admin-DOM.
export { TOPIC_LABELS, CT_CONCEPTS, TOPICS_BY_TRACK } from '../missions/topics.js'
import { TOPIC_LABELS, TOPICS_BY_TRACK } from '../missions/topics.js'

export const BAND_LABELS: Record<string, string> = {
  recognize: 'Впізнавання',
  apply:     'Застосування',
  reason:    'Міркування',
}

/** Перебудовує <select> тем під обраний напрям, зберігаючи вибір якщо можливо. */
export function fillTopicSelect(select: HTMLSelectElement, track: string, emptyLabel: string) {
  const prev = select.value
  const topics = (TOPICS_BY_TRACK as Record<string, readonly string[]>)[track] ?? []
  select.innerHTML = `<option value="">${emptyLabel}</option>` +
    topics.map(t => `<option value="${t}">${TOPIC_LABELS[t] ?? t}</option>`).join('')
  select.value = topics.includes(prev) ? prev : ''
  select.disabled = topics.length === 0
}
