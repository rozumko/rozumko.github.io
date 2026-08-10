// Target sets for «Знайди клавішу». The teacher picks one as the level, so the
// sets are the difficulty axis: ten frequent letters → the whole alphabet →
// digits → the control keys → everything at once.

import type { KeyTarget } from '../typing-core/keyboard-layout.js'

export interface KeyPracticeTarget extends KeyTarget {
  id: string
  kind: 'letter' | 'digit' | 'control'
  value: string
  /** What the child sees in the task card. */
  label: string
}

export const ROUND_LENGTH = 12

function letters(source: string): KeyPracticeTarget[] {
  return Array.from(source).map(letter => ({
    id: `letter-${letter}`,
    kind: 'letter',
    value: letter,
    label: letter.toLocaleUpperCase('uk-UA'),
  }))
}

function digits(): KeyPracticeTarget[] {
  return Array.from('1234567890').map(digit => ({
    id: `digit-${digit}`,
    kind: 'digit',
    value: digit,
    label: digit,
  }))
}

// «Ґ» is deliberately in no set: it is typed with Ctrl+Alt, and this activity
// teaches finding a single key without modifiers.
const ALPHABET = 'абвгдеєжзиіїйклмнопрстуфхцчшщьюя'

const CONTROL_TARGETS: KeyPracticeTarget[] = [
  { id: 'control-space', kind: 'control', value: ' ', label: 'Пробіл', code: 'Space' },
  { id: 'control-enter', kind: 'control', value: 'Enter', label: 'Enter', code: 'Enter' },
  { id: 'control-backspace', kind: 'control', value: 'Backspace', label: 'Backspace', code: 'Backspace' },
  { id: 'control-shift', kind: 'control', value: 'Shift', label: 'Shift', codes: ['ShiftLeft', 'ShiftRight'] },
  { id: 'control-ctrl', kind: 'control', value: 'Ctrl', label: 'Ctrl', codes: ['ControlLeft', 'ControlRight'] },
  // Left Alt only: on the Ukrainian layout the right one acts as AltGr for «ґ».
  { id: 'control-alt', kind: 'control', value: 'Alt', label: 'Alt', code: 'AltLeft' },
]

export const KEY_SETS: Record<string, readonly KeyPracticeTarget[]> = {
  starter: letters('аоіентсрвл'),
  alphabet: letters(ALPHABET),
  digits: digits(),
  controls: CONTROL_TARGETS,
  everything: [...letters(ALPHABET), ...digits(), ...CONTROL_TARGETS],
}

/**
 * The mixed mode promises all three target kinds, so it cannot be a blind
 * sample from the much larger letter pool.
 */
export function buildKeyPracticeRound(level: string): KeyPracticeTarget[] {
  if (level !== 'everything') {
    return drawRound(KEY_SETS[level] ?? KEY_SETS['starter']!, ROUND_LENGTH)
  }

  return shuffle([
    ...drawRound(KEY_SETS['alphabet']!, 6),
    ...drawRound(KEY_SETS['digits']!, 3),
    ...drawRound(KEY_SETS['controls']!, 3),
  ])
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[other]] = [result[other]!, result[index]!]
  }
  return result
}

function drawRound<T extends { id: string }>(items: readonly T[], length: number): T[] {
  const result: T[] = []
  let pool: T[] = []
  while (result.length < length) {
    if (pool.length === 0) {
      pool = shuffle(items)
      if (pool.length > 1 && pool[0]?.id === result[result.length - 1]?.id) {
        ;[pool[0], pool[1]] = [pool[1]!, pool[0]!]
      }
    }
    result.push(pool.shift()!)
  }
  return result
}

export const ENCOURAGEMENT = ['Чудово!', 'Саме так!', 'Правильно!', 'Молодець!', 'Влучно!']
export const RETRY = ['Спробуй ще раз', 'Поглянь уважніше', 'Майже! Шукай далі']
