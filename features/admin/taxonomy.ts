import type { QuestionTrack } from '../api/client.js'

/**
 * UI-копія таксономії вмісту. Джерело правди: docs/content-taxonomy.md
 * (валідація — backend/src/lib/taxonomy.ts, fail-closed).
 */

export const TOPIC_LABELS: Record<string, string> = {
  // informatics
  'information':            'Інформація та повідомлення',
  'data':                   'Дані: групування, таблиці, діаграми',
  'computer-systems':       'Комп’ютер та його складові',
  'algorithms-programming': 'Алгоритми, виконавці, програми',
  'networks-internet':      'Мережі та Інтернет',
  'digital-safety':         'Безпека та цифровий добробут',
  'digital-tools':          'Цифрові інструменти та контент',
  // ai-basics
  'what-is-ai':      'Що таке ШІ',
  'how-ai-learns':   'Як ШІ навчається',
  'ai-perception':   'Як ШІ бачить і чує',
  'human-vs-ai':     'Людина і ШІ',
  'ai-ethics-safety': 'Безпека і довіра до ШІ',
  'ai-tools':        'ШІ як помічник',
  // computational-thinking (теми = концепти)
  'algorithms':     'Алгоритми (послідовність дій)',
  'decomposition':  'Декомпозиція',
  'abstraction':    'Абстрагування',
  'patterns':       'Розпізнавання закономірностей',
  'repetition':     'Повторення (цикли)',
  'logic':          'Логічне мислення',
  'efficiency':     'Ефективність способу',
  'classification': 'Класифікація',
  'debugging':      'Налагодження',
}

export const CT_CONCEPTS = [
  'algorithms', 'decomposition', 'abstraction', 'patterns', 'repetition',
  'logic', 'efficiency', 'classification', 'debugging',
] as const

export const TOPICS_BY_TRACK: Record<QuestionTrack, readonly string[]> = {
  'informatics': [
    'information', 'data', 'computer-systems', 'algorithms-programming',
    'networks-internet', 'digital-safety', 'digital-tools',
  ],
  'ai-basics': [
    'what-is-ai', 'how-ai-learns', 'ai-perception', 'human-vs-ai',
    'ai-ethics-safety', 'ai-tools',
  ],
  'computational-thinking': CT_CONCEPTS,
}

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
