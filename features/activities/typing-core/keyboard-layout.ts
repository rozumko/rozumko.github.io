// ── Ukrainian keyboard layout ────────────────────────────────────────────────
// Geometry, legends and finger colours of the virtual keyboard shared by every
// typing activity. Ported from the standalone Klavio trainers; the data is the
// same device the children already know, only the module wrapper changed.
//
// `code` is the physical KeyboardEvent.code, so the layout works regardless of
// which characters the child's OS layout produces.

export interface KeyDef {
  code: string
  /** What the keycap shows (Ukrainian letter or a control name). */
  label: string
  /** Small legend in the corner — the Latin letter or the shifted symbol. */
  secondary?: string
  /** Character this key types on the Ukrainian layout. */
  value?: string
  /** Character it types with Shift, where that differs from upper case. */
  shiftValue?: string
  width?: 'medium' | 'wide' | 'xwide' | 'space'
  /** Keys the trainers never ask for; drawn quieter. */
  muted?: boolean
}

/** A target is either a character or a named key (Enter, Shift, …). */
export interface KeyTarget {
  value?: string
  code?: string
  codes?: readonly string[]
  kind?: string
}

export const UKRAINIAN_ROWS: readonly (readonly KeyDef[])[] = [
  [
    { code: 'Backquote', label: 'ʼ', secondary: '~', value: "'" },
    { code: 'Digit1', label: '1', secondary: '!', value: '1' },
    { code: 'Digit2', label: '2', secondary: '"', value: '2' },
    { code: 'Digit3', label: '3', secondary: '№', value: '3' },
    { code: 'Digit4', label: '4', secondary: ';', value: '4' },
    { code: 'Digit5', label: '5', secondary: '%', value: '5' },
    { code: 'Digit6', label: '6', secondary: ':', value: '6' },
    { code: 'Digit7', label: '7', secondary: '?', value: '7' },
    { code: 'Digit8', label: '8', secondary: '*', value: '8' },
    { code: 'Digit9', label: '9', secondary: '(', value: '9' },
    { code: 'Digit0', label: '0', secondary: ')', value: '0' },
    { code: 'Minus', label: '−', secondary: '_', muted: true },
    { code: 'Equal', label: '=', secondary: '+', muted: true },
    { code: 'Backspace', label: '⌫', width: 'wide' },
  ],
  [
    { code: 'Tab', label: 'Tab', width: 'medium', muted: true },
    { code: 'KeyQ', label: 'Й', secondary: 'Q', value: 'й' },
    { code: 'KeyW', label: 'Ц', secondary: 'W', value: 'ц' },
    { code: 'KeyE', label: 'У', secondary: 'E', value: 'у' },
    { code: 'KeyR', label: 'К', secondary: 'R', value: 'к' },
    { code: 'KeyT', label: 'Е', secondary: 'T', value: 'е' },
    { code: 'KeyY', label: 'Н', secondary: 'Y', value: 'н' },
    { code: 'KeyU', label: 'Г', secondary: 'U', value: 'г' },
    { code: 'KeyI', label: 'Ш', secondary: 'I', value: 'ш' },
    { code: 'KeyO', label: 'Щ', secondary: 'O', value: 'щ' },
    { code: 'KeyP', label: 'З', secondary: 'P', value: 'з' },
    { code: 'BracketLeft', label: 'Х', secondary: '[', value: 'х' },
    { code: 'BracketRight', label: 'Ї', secondary: ']', value: 'ї' },
    { code: 'Backslash', label: '\\', muted: true },
  ],
  [
    { code: 'CapsLock', label: 'Caps', width: 'wide', muted: true },
    { code: 'KeyA', label: 'Ф', secondary: 'A', value: 'ф' },
    { code: 'KeyS', label: 'І', secondary: 'S', value: 'і' },
    { code: 'KeyD', label: 'В', secondary: 'D', value: 'в' },
    { code: 'KeyF', label: 'А', secondary: 'F', value: 'а' },
    { code: 'KeyG', label: 'П', secondary: 'G', value: 'п' },
    { code: 'KeyH', label: 'Р', secondary: 'H', value: 'р' },
    { code: 'KeyJ', label: 'О', secondary: 'J', value: 'о' },
    { code: 'KeyK', label: 'Л', secondary: 'K', value: 'л' },
    { code: 'KeyL', label: 'Д', secondary: 'L', value: 'д' },
    { code: 'Semicolon', label: 'Ж', secondary: ';', value: 'ж' },
    { code: 'Quote', label: 'Є', secondary: "'", value: 'є' },
    { code: 'Enter', label: 'Enter', width: 'wide' },
  ],
  [
    { code: 'ShiftLeft', label: 'Shift', width: 'xwide' },
    { code: 'KeyZ', label: 'Я', secondary: 'Z', value: 'я' },
    { code: 'KeyX', label: 'Ч', secondary: 'X', value: 'ч' },
    { code: 'KeyC', label: 'С', secondary: 'C', value: 'с' },
    { code: 'KeyV', label: 'М', secondary: 'V', value: 'м' },
    { code: 'KeyB', label: 'И', secondary: 'B', value: 'и' },
    { code: 'KeyN', label: 'Т', secondary: 'N', value: 'т' },
    { code: 'KeyM', label: 'Ь', secondary: 'M', value: 'ь' },
    { code: 'Comma', label: 'Б', secondary: '<', value: 'б' },
    { code: 'Period', label: 'Ю', secondary: '>', value: 'ю' },
    { code: 'Slash', label: '.', secondary: ',', value: '.', shiftValue: ',' },
    { code: 'ShiftRight', label: 'Shift', width: 'xwide' },
  ],
  [
    { code: 'ControlLeft', label: 'Ctrl', width: 'medium', muted: true },
    { code: 'MetaLeft', label: 'Win', width: 'medium', muted: true },
    { code: 'AltLeft', label: 'Alt', width: 'medium', muted: true },
    { code: 'Space', label: 'Пробіл', width: 'space', value: ' ' },
    { code: 'AltRight', label: 'AltGr', width: 'medium', muted: true },
    { code: 'ControlRight', label: 'Ctrl', width: 'medium', muted: true },
  ],
]

export type Hand = 'left' | 'right' | 'both'
export type Finger = 'pinky' | 'ring' | 'middle' | 'index' | 'thumb'

export interface FingerInfo {
  hand: Hand
  finger: Finger
  /** Ukrainian name for the child-facing hint. */
  name: string
  code: string
}

const FINGER_BY_CODE: Record<string, [Hand, Finger, string]> = {
  Backquote: ['left', 'pinky', 'мізинець'], Digit1: ['left', 'pinky', 'мізинець'],
  Tab: ['left', 'pinky', 'мізинець'], KeyQ: ['left', 'pinky', 'мізинець'],
  CapsLock: ['left', 'pinky', 'мізинець'], KeyA: ['left', 'pinky', 'мізинець'],
  ShiftLeft: ['left', 'pinky', 'мізинець'], KeyZ: ['left', 'pinky', 'мізинець'],
  Digit2: ['left', 'ring', 'безіменний'], KeyW: ['left', 'ring', 'безіменний'],
  KeyS: ['left', 'ring', 'безіменний'], KeyX: ['left', 'ring', 'безіменний'],
  Digit3: ['left', 'middle', 'середній'], KeyE: ['left', 'middle', 'середній'],
  KeyD: ['left', 'middle', 'середній'], KeyC: ['left', 'middle', 'середній'],
  Digit4: ['left', 'index', 'вказівний'], Digit5: ['left', 'index', 'вказівний'],
  KeyR: ['left', 'index', 'вказівний'], KeyT: ['left', 'index', 'вказівний'],
  KeyF: ['left', 'index', 'вказівний'], KeyG: ['left', 'index', 'вказівний'],
  KeyV: ['left', 'index', 'вказівний'], KeyB: ['left', 'index', 'вказівний'],
  Digit6: ['right', 'index', 'вказівний'], Digit7: ['right', 'index', 'вказівний'],
  KeyY: ['right', 'index', 'вказівний'], KeyU: ['right', 'index', 'вказівний'],
  KeyH: ['right', 'index', 'вказівний'], KeyJ: ['right', 'index', 'вказівний'],
  KeyN: ['right', 'index', 'вказівний'], KeyM: ['right', 'index', 'вказівний'],
  Digit8: ['right', 'middle', 'середній'], KeyI: ['right', 'middle', 'середній'],
  KeyK: ['right', 'middle', 'середній'], Comma: ['right', 'middle', 'середній'],
  Digit9: ['right', 'ring', 'безіменний'], KeyO: ['right', 'ring', 'безіменний'],
  KeyL: ['right', 'ring', 'безіменний'], Period: ['right', 'ring', 'безіменний'],
  Digit0: ['right', 'pinky', 'мізинець'], Minus: ['right', 'pinky', 'мізинець'],
  Equal: ['right', 'pinky', 'мізинець'], Backspace: ['right', 'pinky', 'мізинець'],
  KeyP: ['right', 'pinky', 'мізинець'], BracketLeft: ['right', 'pinky', 'мізинець'],
  BracketRight: ['right', 'pinky', 'мізинець'], Backslash: ['right', 'pinky', 'мізинець'],
  Semicolon: ['right', 'pinky', 'мізинець'], Quote: ['right', 'pinky', 'мізинець'],
  Enter: ['right', 'pinky', 'мізинець'], Slash: ['right', 'pinky', 'мізинець'],
  ShiftRight: ['right', 'pinky', 'мізинець'],
}

function normalize(value: string | undefined): string {
  return typeof value === 'string' ? value.toLocaleLowerCase('uk-UA') : ''
}

/** Physical keys that produce this target. */
export function codesForTarget(target: KeyTarget): string[] {
  if (Array.isArray(target.codes)) return [...target.codes]
  if (target.code) return [target.code]

  const wanted = normalize(target.value)
  // On the school Windows machines «ґ» is typed as Ctrl+Alt+Г, so the key to
  // point at is the physical Г (KeyU), not Backslash.
  if (wanted === 'ґ') return ['KeyU']

  const matches: string[] = []
  for (const row of UKRAINIAN_ROWS) {
    for (const key of row) {
      if (normalize(key.value) === wanted || normalize(key.shiftValue) === wanted) matches.push(key.code)
    }
  }
  return matches
}

export function requiresShift(value: string | undefined): boolean {
  if (typeof value !== 'string' || value.length !== 1) return false
  for (const row of UKRAINIAN_ROWS) {
    for (const key of row) {
      if (key.shiftValue === value) return true
    }
  }
  return /[А-ЯІЇЄҐ]/.test(value)
}

/** «Ґ» needs AltGr (Ctrl+Alt), not a key of its own. */
export function requiresAltGraph(value: string | undefined): boolean {
  return value === 'ґ' || value === 'Ґ'
}

export function fingerForCode(code: string | null): FingerInfo | null {
  if (!code) return null
  if (code === 'Space') return { hand: 'both', finger: 'thumb', name: 'великі пальці', code: 'Space' }
  const value = FINGER_BY_CODE[code]
  return value ? { hand: value[0], finger: value[1], name: value[2], code } : null
}

/** Which finger (and Shift, when needed) types this character. */
export function hintsForCharacter(value: string): FingerInfo[] {
  const codes = codesForTarget({ value })
  const mainCode = codes[0] ?? null
  if (mainCode === 'Space') return [{ hand: 'both', finger: 'thumb', name: 'великі пальці', code: 'Space' }]

  const hints: FingerInfo[] = []
  const mainFinger = fingerForCode(mainCode)
  if (mainFinger) hints.push(mainFinger)
  if (requiresShift(value) && mainFinger) {
    const shift = fingerForCode(mainFinger.hand === 'left' ? 'ShiftRight' : 'ShiftLeft')
    if (shift) hints.push(shift)
  }
  return hints
}

/** Modifier keys to light up together with the main one. */
export function modifierCodesForCharacter(value: string | undefined): string[] {
  const codes: string[] = []
  if (requiresAltGraph(value)) codes.push('ControlRight', 'AltRight')
  if (requiresShift(value)) {
    const mainFinger = fingerForCode(codesForTarget({ value })[0] ?? null)
    codes.push(mainFinger?.hand === 'left' ? 'ShiftRight' : 'ShiftLeft')
  }
  return codes
}

/** Short "how to press it" line for the cases where one key is not enough. */
export function comboHintForCharacter(value: string | undefined): string {
  if (requiresAltGraph(value)) {
    return value === 'Ґ'
      ? 'Утримуй Ctrl + Alt + Shift і натисни Г'
      : 'Утримуй Ctrl + Alt і натисни Г'
  }
  return requiresShift(value) ? 'Утримуй Shift' : ''
}

/** Fills a keycap element. textContent only — a legend can never inject. */
export function renderKeycap(element: HTMLElement, definition: KeyDef): void {
  element.textContent = ''
  if (definition.secondary) {
    const secondary = document.createElement('span')
    secondary.className = 'key-legend key-legend--secondary'
    secondary.textContent = definition.secondary
    const primary = document.createElement('span')
    primary.className = 'key-legend key-legend--primary'
    primary.textContent = definition.label
    element.classList.add('keyboard-key--dual')
    element.append(secondary, primary)
    return
  }
  const primary = document.createElement('span')
  primary.className = 'key-legend key-legend--single'
  primary.textContent = definition.label
  element.appendChild(primary)
}
