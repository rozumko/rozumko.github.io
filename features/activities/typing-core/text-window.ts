// A lesson text is longer than one line on a school monitor, so the child sees
// a moving window around the caret instead of a wall of characters.

export interface TextWindow {
  done: string
  current: string
  todo: string
}

/**
 * `visible` characters around `position`, with the caret held `caretAt`
 * characters from the left so the text scrolls under it instead of jumping.
 */
export function textWindow(text: string, position: number, visible = 86, caretAt = 30): TextWindow {
  const safePosition = Math.max(0, Math.min(position, text.length))
  const maxStart = Math.max(0, text.length - visible)
  const start = Math.min(maxStart, Math.max(0, safePosition - caretAt))
  const fragment = text.slice(start, Math.min(text.length, start + visible))
  const local = safePosition - start

  return {
    done: fragment.slice(0, local),
    current: fragment[local] ?? '',
    todo: fragment.slice(local + 1),
  }
}
