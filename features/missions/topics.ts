import type { QuestionTrack } from '../api/client.js'

/**
 * Спільна UI-копія таксономії тем (публічні сторінки + адмінка).
 * Джерело правди: docs/content-taxonomy.md; валідація —
 * backend/src/lib/taxonomy.ts (fail-closed).
 */

export const TOPIC_LABELS: Record<string, string> = {
  // informatics
  'information':            'Інформація',
  'data':                   'Дані',
  'computer-systems':       'Комп’ютер і пристрої',
  'algorithms-programming': 'Виконавці й програми',
  'networks-internet':      'Мережі, інтернет і пошук',
  'digital-safety':         'Цифрова безпека',
  'digital-tools':          'Цифрові інструменти й файли',
  // ai-basics
  'what-is-ai':      'Що таке ШІ',
  'how-ai-learns':   'Дані для ШІ',
  'ai-perception':   'Розпізнавання',
  'human-vs-ai':     'Людина і ШІ',
  'ai-ethics-safety': 'Довіра й безпека ШІ',
  'ai-tools':        'ШІ як помічник',
  // computational-thinking (теми = концепти)
  'algorithms':     'Алгоритми',
  'decomposition':  'Декомпозиція',
  'abstraction':    'Абстрагування',
  'patterns':       'Закономірності',
  'repetition':     'Повторення (цикли)',
  'logic':          'Логіка',
  'efficiency':     'Ефективність способу',
  'classification': 'Класифікація',
  'debugging':      'Налагодження',
}

/** Короткі підписи для чипів (діти) — компактніші за повні лейбли. */
export const TOPIC_SHORT: Record<string, string> = {
  'information': 'Інформація',
  'data': 'Дані',
  'computer-systems': 'Комп’ютер',
  'algorithms-programming': 'Алгоритми',
  'networks-internet': 'Інтернет',
  'digital-safety': 'Безпека',
  'digital-tools': 'Інструменти',
  'what-is-ai': 'Що таке ШІ',
  'how-ai-learns': 'Як вчиться',
  'ai-perception': 'Бачить і чує',
  'human-vs-ai': 'Людина і ШІ',
  'ai-ethics-safety': 'Довіра до ШІ',
  'ai-tools': 'ШІ-помічник',
  'algorithms': 'Алгоритми',
  'decomposition': 'Декомпозиція',
  'abstraction': 'Абстрагування',
  'patterns': 'Закономірності',
  'repetition': 'Повторення',
  'logic': 'Логіка',
  'efficiency': 'Ефективність',
  'classification': 'Класифікація',
  'debugging': 'Налагодження',
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
