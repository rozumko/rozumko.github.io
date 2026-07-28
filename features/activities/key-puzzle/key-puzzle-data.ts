// Keyboard layout for the key puzzle: the standard 5-row layout with the
// Ukrainian legend under the Latin one, exactly as on a school lab keyboard.
// Only `letter` keys become draggable pieces; the rest are scenery so the
// board still reads as a keyboard.

export interface KeyDef {
  code: string
  /** Latin legend (top-left on a real key cap). */
  top?: string
  /** Ukrainian legend (bottom-right). */
  bottom?: string
  /** Single label for function keys (Tab, Shift…). */
  label?: string
  /** Width in layout units; 48 is one letter key. */
  w: number
  func?: boolean
  letter?: boolean
  space?: boolean
}

export const KEYBOARD_ROWS: readonly (readonly KeyDef[])[] = [
  [
    { code: 'Backquote', top: '~', bottom: '`', w: 48 },
    { code: 'Digit1', top: '!', bottom: '1', w: 48 },
    { code: 'Digit2', top: '@', bottom: '2', w: 48 },
    { code: 'Digit3', top: '#', bottom: '3', w: 48 },
    { code: 'Digit4', top: '$', bottom: '4', w: 48 },
    { code: 'Digit5', top: '%', bottom: '5', w: 48 },
    { code: 'Digit6', top: '^', bottom: '6', w: 48 },
    { code: 'Digit7', top: '&', bottom: '7', w: 48 },
    { code: 'Digit8', top: '*', bottom: '8', w: 48 },
    { code: 'Digit9', top: '(', bottom: '9', w: 48 },
    { code: 'Digit0', top: ')', bottom: '0', w: 48 },
    { code: 'Minus', top: '_', bottom: '-', w: 48 },
    { code: 'Equal', top: '+', bottom: '=', w: 48 },
    { code: 'Backspace', label: '←', w: 88, func: true },
  ],
  [
    { code: 'Tab', label: 'Tab', w: 72, func: true },
    { code: 'KeyQ', top: 'Q', bottom: 'Й', w: 48, letter: true },
    { code: 'KeyW', top: 'W', bottom: 'Ц', w: 48, letter: true },
    { code: 'KeyE', top: 'E', bottom: 'У', w: 48, letter: true },
    { code: 'KeyR', top: 'R', bottom: 'К', w: 48, letter: true },
    { code: 'KeyT', top: 'T', bottom: 'Е', w: 48, letter: true },
    { code: 'KeyY', top: 'Y', bottom: 'Н', w: 48, letter: true },
    { code: 'KeyU', top: 'U', bottom: 'Г', w: 48, letter: true },
    { code: 'KeyI', top: 'I', bottom: 'Ш', w: 48, letter: true },
    { code: 'KeyO', top: 'O', bottom: 'Щ', w: 48, letter: true },
    { code: 'KeyP', top: 'P', bottom: 'З', w: 48, letter: true },
    { code: 'BracketLeft', top: '{', bottom: 'Х', w: 48 },
    { code: 'BracketRight', top: '}', bottom: 'Ї', w: 48 },
    { code: 'Backslash', top: '|', bottom: '\\', w: 64 },
  ],
  [
    { code: 'CapsLock', label: 'Caps', w: 88, func: true },
    { code: 'KeyA', top: 'A', bottom: 'Ф', w: 48, letter: true },
    { code: 'KeyS', top: 'S', bottom: 'І', w: 48, letter: true },
    { code: 'KeyD', top: 'D', bottom: 'В', w: 48, letter: true },
    { code: 'KeyF', top: 'F', bottom: 'А', w: 48, letter: true },
    { code: 'KeyG', top: 'G', bottom: 'П', w: 48, letter: true },
    { code: 'KeyH', top: 'H', bottom: 'Р', w: 48, letter: true },
    { code: 'KeyJ', top: 'J', bottom: 'О', w: 48, letter: true },
    { code: 'KeyK', top: 'K', bottom: 'Л', w: 48, letter: true },
    { code: 'KeyL', top: 'L', bottom: 'Д', w: 48, letter: true },
    { code: 'Semicolon', top: ':', bottom: 'Ж', w: 48 },
    { code: 'Quote', top: '"', bottom: 'Є', w: 48 },
    { code: 'Enter', label: 'Enter', w: 100, func: true },
  ],
  [
    { code: 'ShiftLeft', label: 'Shift', w: 120, func: true },
    { code: 'KeyZ', top: 'Z', bottom: 'Я', w: 48, letter: true },
    { code: 'KeyX', top: 'X', bottom: 'Ч', w: 48, letter: true },
    { code: 'KeyC', top: 'C', bottom: 'С', w: 48, letter: true },
    { code: 'KeyV', top: 'V', bottom: 'М', w: 48, letter: true },
    { code: 'KeyB', top: 'B', bottom: 'И', w: 48, letter: true },
    { code: 'KeyN', top: 'N', bottom: 'Т', w: 48, letter: true },
    { code: 'KeyM', top: 'M', bottom: 'Ь', w: 48, letter: true },
    { code: 'Comma', top: '<', bottom: 'Б', w: 48 },
    { code: 'Period', top: '>', bottom: 'Ю', w: 48 },
    { code: 'Slash', top: '?', bottom: '.', w: 48 },
    { code: 'ShiftRight', label: 'Shift', w: 104, func: true },
  ],
  [
    { code: 'ControlLeft', label: 'Ctrl', w: 64, func: true },
    { code: 'MetaLeft', label: 'Win', w: 64, func: true },
    { code: 'AltLeft', label: 'Alt', w: 64, func: true },
    { code: 'Space', label: '', w: 320, func: true, space: true },
    { code: 'AltRight', label: 'Alt', w: 64, func: true },
    { code: 'ControlRight', label: 'Ctrl', w: 64, func: true },
  ],
]

export const LETTER_KEYS: readonly KeyDef[] = KEYBOARD_ROWS.flat().filter(k => k.letter)

/** How many letters start already in place, so the board is never fully blank. */
export const PREPLACED_MIN = 7
export const PREPLACED_MAX = 11
