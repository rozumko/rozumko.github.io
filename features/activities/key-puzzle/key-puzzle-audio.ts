// Trimmed WebAudio kit for the key puzzle: pick up, hover, place, miss, snap
// back. No audio files, no external libs. Ported from the standalone game —
// the feedback sounds are a big part of why children stay with it.
//
// Every entry point is fail-quiet: sound is a bonus, never a reason for the
// activity to break.

type Ctx = AudioContext

let ctx: Ctx | null = null

function audio(): Ctx | null {
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
  attack?: number
  /** Slide to this frequency over the note's length. */
  slideTo?: number
  /** Start offset in seconds from now. */
  delay?: number
}

function tone({ freq, type = 'sine', dur = 0.2, vol = 0.12, attack = 0.01, slideTo, delay = 0 }: ToneOptions): void {
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(vol, t0 + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

function noise(dur: number, vol = 0.05, filterFreq = 2000): void {
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime
  const size = Math.max(1, Math.floor(ac.sampleRate * dur))
  const buffer = ac.createBuffer(1, size, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  const gain = ac.createGain()
  src.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.value = filterFreq
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(gain).connect(ac.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

function quiet(play: () => void): void {
  try { play() } catch { /* sound is a bonus */ }
}

/** Soft pop when a key is picked up. */
export function playPickup(): void {
  quiet(() => {
    tone({ freq: 900, dur: 0.12, vol: 0.16, attack: 0.008, slideTo: 500 })
    noise(0.06, 0.03, 3500)
  })
}

/** Gentle chime when the dragged key hovers a free slot. */
export function playHover(): void {
  quiet(() => {
    tone({ freq: 1480, dur: 0.2, vol: 0.05 })
    tone({ freq: 2960, dur: 0.15, vol: 0.02 })
  })
}

/** Major arpeggio when a key lands in the right place. */
export function playPlaced(): void {
  quiet(() => {
    ;[523.25, 659.25, 784.0, 1046.5].forEach((freq, i) => {
      tone({ freq, dur: 0.4, vol: 0.12, delay: i * 0.06 })
    })
  })
}

/** Soft descending wobble on a wrong slot — noticeable, not scary. */
export function playMiss(): void {
  quiet(() => {
    tone({ freq: 320, type: 'sawtooth', dur: 0.28, vol: 0.1, attack: 0.015, slideTo: 120 })
  })
}

/** Low "whoosh" when the key returns to where it was. */
export function playSnapBack(): void {
  quiet(() => {
    tone({ freq: 200, dur: 0.16, vol: 0.07, slideTo: 80 })
    noise(0.12, 0.02, 600)
  })
}
