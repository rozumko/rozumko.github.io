/**
 * Question text is sized from the viewport (`clamp(vw)`) on every surface, and
 * a viewport knows nothing about how much text there is. A short stem looks
 * right at that scale while a long one inflates the question card until the
 * answer options are pushed off the screen — and a child never scrolls to find
 * an option they cannot see.
 *
 * CSS cannot count characters, so the runner tags the text element with a
 * length bucket and each surface picks a scale that still leaves room for the
 * options. Buckets, not measured font sizes: one attribute per render, the same
 * result every time, and testable.
 */
// Calibrated against the projector, the tightest surface: at its largest scale
// a stem past ~45 characters already fills two lines, and past ~160 it cannot
// stay on one screen with four options no matter how the card is arranged.
const BUCKETS = [
  { upTo: 45, name: 'short' },
  { upTo: 90, name: 'medium' },
  { upTo: 160, name: 'long' },
] as const

export type QuestionLength = typeof BUCKETS[number]['name'] | 'xlong'

export function questionLengthBucket(text: string): QuestionLength {
  const length = text.trim().length
  return BUCKETS.find(bucket => length <= bucket.upTo)?.name ?? 'xlong'
}

/** Tags the question text element so CSS can scale it by how much text it holds. */
export function applyQuestionLength(el: HTMLElement | null | undefined, text: string): void {
  if (el) el.dataset.qlength = questionLengthBucket(text)
}
