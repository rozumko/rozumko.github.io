// Anti-peeking shuffle for class games: each participant gets their own
// deterministic order of questions and answer options, so neighbors can't
// copy by position ("яка була третя?").
//
// Scoring stays server-side and is keyed to the ORIGINAL option order, so
// every submitted index must be mapped back via toOriginalAnswer(). If a
// question still carries a local `correct` key (practice surfaces), it is
// remapped to the shuffled position — local scoring keeps working too.

export interface ShuffleableQuestion {
  id: string
  type?: string
  options?: string[] | Record<string, unknown>
  a?: string[]
  choices?: string[]
  correct?: number | boolean | string | null
  [key: string]: unknown
}

export interface ShuffledDeck<Q extends ShuffleableQuestion> {
  questions: Q[]
  /** Map a renderer answer (index into shuffled options) back to the original index. */
  toOriginalAnswer(questionId: string, answer: number | string | number[]): number | string | number[]
}

// FNV-1a: stable numeric seed from participantId (any string).
function hashSeed(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// mulberry32 — tiny deterministic PRNG, enough for shuffling.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleInPlace<T>(arr: T[], rnd: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/**
 * Deterministic shuffle of question order + answer options for one participant.
 * Only radio-style option lists are shuffled (choice options, sequence choices):
 * truefalse keeps Так/Ні semantics, sort/match already randomize presentation.
 */
export function shuffleDeck<Q extends ShuffleableQuestion>(questions: Q[], seedKey: string): ShuffledDeck<Q> {
  const rnd = mulberry32(hashSeed(seedKey))
  const ordered = [...questions]
  shuffleInPlace(ordered, rnd)

  // questionId → perm, where perm[shuffledIndex] = originalIndex
  const optionMaps = new Map<string, number[]>()

  const shuffled = ordered.map(q => {
    const type = q.type ?? 'choice'

    if (type === 'choice') {
      const opts = Array.isArray(q.options) ? q.options : q.a
      if (!Array.isArray(opts) || opts.length < 2) return q
      const perm = [...opts.keys()]
      shuffleInPlace(perm, rnd)
      const shuffledOpts = perm.map(i => opts[i])
      optionMaps.set(q.id, perm)
      const next = { ...q, options: shuffledOpts, a: shuffledOpts }
      if (typeof q.correct === 'number') next.correct = perm.indexOf(q.correct)
      return next
    }

    if (type === 'sequence') {
      const choices = q.choices
      if (!Array.isArray(choices) || choices.length < 2) return q
      const perm = [...choices.keys()]
      shuffleInPlace(perm, rnd)
      optionMaps.set(q.id, perm)
      const next = { ...q, choices: perm.map(i => choices[i]) }
      if (typeof q.correct === 'number') next.correct = perm.indexOf(q.correct)
      return next
    }

    return q
  })

  return {
    questions: shuffled,
    toOriginalAnswer(questionId, answer) {
      const perm = optionMaps.get(questionId)
      if (perm && typeof answer === 'number' && perm[answer] !== undefined) return perm[answer]
      return answer
    },
  }
}
