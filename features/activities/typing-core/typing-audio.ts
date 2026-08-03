// Three feedback tones for the typing activities: hit, miss, round complete.
// Same shape as key-puzzle-audio.ts — no files, no libraries, and every entry
// point is fail-quiet, because sound is a bonus and never a reason to break.

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume()
      return ctx
    }
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    return ctx
  } catch { return null }
}

/** Releases the shared context; the activity calls this on destroy. */
export function closeAudio(): void {
  try { void ctx?.close() } catch { /* already closed */ }
  ctx = null
}

interface ToneOptions {
  freq: number
  type?: OscillatorType
  dur?: number
  vol?: number
  /** Start offset in seconds from now. */
  delay?: number
}

function tone({ freq, type = 'sine', dur = 0.08, vol = 0.055, delay = 0 }: ToneOptions): void {
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur + 0.03)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.04)
}

function quiet(play: () => void): void {
  try { play() } catch { /* sound is a bonus */ }
}

/** Two rising notes on the right key. */
export function playHit(): void {
  quiet(() => {
    tone({ freq: 523, dur: 0.07, vol: 0.06 })
    tone({ freq: 659, dur: 0.08, vol: 0.055, delay: 0.07 })
  })
}

/** Short low blip on a wrong key — noticeable, not scary. */
export function playMiss(): void {
  quiet(() => tone({ freq: 190, type: 'square', dur: 0.07, vol: 0.035 }))
}

/** Major arpeggio when the round is done. */
export function playComplete(): void {
  quiet(() => {
    ;[523, 659, 784, 1047].forEach((freq, i) => {
      tone({ freq, dur: 0.11, vol: 0.06, delay: i * 0.09 })
    })
  })
}
