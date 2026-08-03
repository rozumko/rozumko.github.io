// ── Keyboard input rules ─────────────────────────────────────────────────────
// Decides what counts as an attempt and what counts as a hit. Ported from the
// standalone Klavio trainers, where these rules were tuned against real school
// machines (Windows + Ukrainian layout).

import type { KeyTarget } from './keyboard-layout.js'

const APOSTROPHES = /['ʼ’]/g
const UKRAINIAN_CHARACTER = /[а-яіїєґА-ЯІЇЄҐ]/

export const MODIFIER_CODES = [
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
] as const

/** A modifier is "alone" when no other modifier is held with it. */
const LONE_MODIFIER_FLAGS: Record<string, readonly ('altKey' | 'shiftKey' | 'metaKey' | 'ctrlKey')[]> = {
  Control: ['altKey', 'shiftKey', 'metaKey'],
  Alt: ['ctrlKey', 'shiftKey', 'metaKey'],
  Shift: ['ctrlKey', 'altKey', 'metaKey'],
}

export function normalizeCharacter(value: unknown): string {
  return typeof value === 'string' ? value.replace(APOSTROPHES, "'") : ''
}

export function isModifierCode(code: string): boolean {
  return (MODIFIER_CODES as readonly string[]).includes(code)
}

/**
 * AltGr arrives as Ctrl+Alt on Windows. That is ordinary typing of «ґ», not a
 * system shortcut, so such an event must not be discarded.
 */
export function isAltGraph(event: KeyboardEvent): boolean {
  return Boolean(event.ctrlKey && event.altKey)
}

/**
 * Ctrl, Alt and Shift are targets of their own in the key trainer. Pressed
 * alone they trigger nothing, so the event has to pass through.
 */
export function isLoneModifier(event: KeyboardEvent): boolean {
  const flags = LONE_MODIFIER_FLAGS[event.key]
  if (!flags) return false
  return flags.every(flag => !event[flag])
}

export function isSystemCombination(event: KeyboardEvent): boolean {
  if (event.repeat || event.metaKey) return true
  if (isLoneModifier(event)) return false
  if (isAltGraph(event)) return false
  return Boolean(event.ctrlKey || event.altKey)
}

/** The space bar has to be visible in the task, not an empty gap. */
export function displayCharacter(value: string): string {
  return value === ' ' ? '␣' : value
}

/** Spoken form of a character, for the stage's aria-label. */
export function describeCharacter(value: string): string {
  return value === ' ' ? 'пробіл' : value
}

/** Did the child try to type a character at all? */
export function isTextAttempt(event: KeyboardEvent): boolean {
  if (isSystemCombination(event)) return false
  return typeof event.key === 'string' && event.key.length === 1
}

/** Does this keypress produce the character the text is waiting for? */
export function matchesCharacter(expected: string, event: KeyboardEvent): boolean {
  if (expected === ' ') return event.code === 'Space'
  const wanted = normalizeCharacter(expected)
  const actual = normalizeCharacter(event.key)

  // In this school scheme «ґ» is specifically Ctrl+Alt+Г. Both the character
  // and the physical key are checked, so another layout scheme cannot teach
  // the child the wrong movement.
  if (wanted.toLocaleLowerCase('uk-UA') === 'ґ') {
    return actual === wanted && isAltGraph(event) && event.code === 'KeyU'
  }

  return wanted === actual
}

/** Why an attempt failed — the wrong layout deserves its own message. */
export function issue(expected: string, event: KeyboardEvent): 'layout' | 'case' | 'wrong' {
  const wanted = normalizeCharacter(expected)
  const actual = normalizeCharacter(event.key || '')

  if (UKRAINIAN_CHARACTER.test(wanted) && /^[a-z]$/i.test(actual)) return 'layout'
  if (wanted !== actual && wanted.toLocaleLowerCase('uk-UA') === actual.toLocaleLowerCase('uk-UA')) return 'case'
  return 'wrong'
}

/**
 * Was this keypress an answer to the current target at all?
 *
 * `codes` are the physical keys that produce the target — the caller resolves
 * them through keyboard-layout, so these rules stay layout-agnostic (and
 * testable without a DOM).
 */
export function isTargetAttempt(
  target: KeyTarget | null,
  event: KeyboardEvent,
  codes: readonly string[],
): boolean {
  if (isSystemCombination(event)) return false

  // A modifier counts as an attempt only when it is what we asked for.
  // Otherwise Shift before a capital letter, or Ctrl from AltGr, would be a
  // mistake.
  if (isModifierCode(event.code)) return codes.includes(event.code)

  if (typeof event.key === 'string' && event.key.length === 1) return true
  return codes.includes(event.code)
}

export function matchesTarget(
  target: KeyTarget | null,
  event: KeyboardEvent,
  codes: readonly string[],
): boolean {
  if (!target) return false
  if (target.kind === 'control' || isModifierCode(event.code)) return codes.includes(event.code)

  return normalizeCharacter(event.key).toLocaleLowerCase('uk-UA')
    === normalizeCharacter(target.value).toLocaleLowerCase('uk-UA')
}
