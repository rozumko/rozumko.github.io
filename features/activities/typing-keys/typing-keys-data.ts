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

export const ENCOURAGEMENT = ['Чудово!', 'Саме так!', 'Правильно!', 'Молодець!', 'Влучно!']
export const RETRY = ['Спробуй ще раз', 'Поглянь уважніше', 'Майже! Шукай далі']
