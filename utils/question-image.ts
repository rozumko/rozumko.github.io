/**
 * Default question illustrations (public/assets/basics/).
 *
 * Every question gets an image: an explicit q.img always wins; otherwise a
 * default is resolved from question type → topic → conceptKey, with
 * thinks_laptop.webp as the final fallback. Defaults are resolved at render
 * time only — they are never stored in the DB, so swapping a file in
 * public/assets/basics/ updates every surface at once.
 */

const BASICS = '/assets/basics/'

// Mapping principle: an image is assigned only when the association is obvious
// to a 6–10-year-old at a glance. Anything ambiguous gets a neutral placeholder
// (the mascot with a laptop/tablet and a question mark) so the picture never
// looks like part of the task itself (e.g. a cipher next to a safety question).
const NEUTRAL_LAPTOP = 'thinks_laptop.webp'
const NEUTRAL_TABLET = 'thinks_tablet.webp'

/** Mechanic-specific defaults. 'choice', 'input' and 'sequence' are
 *  intentionally absent — they fall through to topic/concept so the image
 *  reflects the subject (a sandwich next to a traffic-light sequence read as
 *  part of the task). */
const BY_TYPE: Record<string, string> = {
  truefalse: 'yes_or_no.webp',          // mascot between a check and a cross
  match:     'pairs.webp',              // mascot connecting card pairs
  sort:      'thinks_numbers.webp',     // number cards out of order
  algorithm: 'thinks_numbers.webp',     // legacy alias of 'sort' in the renderer
}

/** CT concepts (conceptKey; also the topics of the computational-thinking track). */
const BY_CONCEPT: Record<string, string> = {
  'algorithms':     'thinks_flowchart.webp', // start→end flow, no prose
  'decomposition':  'thinks_robot.webp',     // robot exploded into parts
  'repetition':     'thinks_loop.webp',      // arrows in a cycle
  'logic':          'thinks_condition.webp', // if → yes/no branch
  'classification': 'thinks_sorting.webp',   // grouping colored blocks
  'patterns':       'patterns.webp',          // magnifier over repeating shapes
  'debugging':      'debugging.webp',         // magnifier over code with a bug
  // No obvious picture yet — neutral placeholders:
  'abstraction':    NEUTRAL_TABLET,
  'efficiency':     NEUTRAL_TABLET,
}

/** Subject topics (informatics + ai-basics; docs/content-taxonomy.md). */
const BY_TOPIC: Record<string, string> = {
  // informatics
  'information':            'thinks_book.webp',        // mascot reading
  'data':                   'thinks_numbers.webp',     // numbers = data
  'computer-systems':       'thinks_system_unit.webp', // PC parts
  'algorithms-programming': 'scratch.webp',            // Scratch blocks
  'networks-internet':      'thinks_globus.webp',      // globe = the internet
  'digital-tools':          NEUTRAL_TABLET,
  'digital-safety':         'antivirus.webp',          // lock shield vs pixel viruses
  // ai-basics
  'what-is-ai':             'thinks_chatbot.webp',     // bot chat on a phone
  'human-vs-ai':            'robot_and_man.webp',      // robot and boy shaking hands
  'ai-ethics-safety':       'defender.webp',           // knight robot with a shield
  'how-ai-learns':          NEUTRAL_LAPTOP,
  'ai-perception':          NEUTRAL_TABLET,
  'ai-tools':               NEUTRAL_TABLET,
  ...BY_CONCEPT,            // computational-thinking topics are the CT concepts
}

const FALLBACK = NEUTRAL_LAPTOP

export interface QuestionImage {
  src: string
  alt: string
  /** true — generic placeholder, not question-specific content */
  isDefault: boolean
}

interface ImageableQuestion {
  img?: string | null
  imageAlt?: string | null
  code?: string | null
  type?: string | null
  topic?: string | null
  conceptKey?: string | null
  [key: string]: unknown
}

/** null → no image (question ships a code block instead; screens are sized for
 *  one visual at a time — see the quiz-fit contract in tests/layout). */
export function resolveQuestionImage(q: ImageableQuestion): QuestionImage | null {
  const explicit = typeof q.img === 'string' ? q.img.trim() : ''
  if (explicit) {
    return { src: explicit, alt: String(q.imageAlt ?? 'Зображення до питання'), isDefault: false }
  }

  if (q.code) return null

  const file =
    BY_TYPE[q.type ?? ''] ??
    BY_TOPIC[q.topic ?? ''] ??
    BY_CONCEPT[q.conceptKey ?? ''] ??
    FALLBACK

  // Default images are decorative: they add mood, not answer-relevant info.
  return { src: BASICS + file, alt: '', isDefault: true }
}
