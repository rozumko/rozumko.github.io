// Small WebAudio kit for the mouse-button trainer: steer, pick up, crash.
// No files, no libraries, and fail-quiet everywhere — sound is a bonus.

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

export function closeAudio(): void {
  try { void ctx?.close() } catch { /* already closed */ }
  ctx = null
}

function tone(freq: number, type: OscillatorType, dur: number, vol: number, delay = 0): void {
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

function noise(dur: number, vol: number): void {
  const ac = audio()
  if (!ac) return
  const size = Math.max(1, Math.floor(ac.sampleRate * dur))
  const buffer = ac.createBuffer(1, size, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  const gain = ac.createGain()
  src.buffer = buffer
  gain.gain.setValueAtTime(vol, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur)
  src.connect(gain).connect(ac.destination)
  src.start()
}

function quiet(play: () => void): void {
  try { play() } catch { /* sound is a bonus */ }
}

/** Short blip on every lane change — the feedback that a button registered. */
export function playSteer(): void {
  quiet(() => tone(210, 'triangle', 0.08, 0.05))
}

export function playStar(): void {
  quiet(() => tone(900, 'sine', 0.12, 0.09))
}

export function playBolt(): void {
  quiet(() => {
    tone(820, 'sine', 0.1, 0.1)
    tone(1200, 'sine', 0.18, 0.09, 0.09)
  })
}

export function playCrash(): void {
  quiet(() => {
    tone(110, 'sawtooth', 0.28, 0.2)
    noise(0.28, 0.18)
  })
}

/** Two-tone siren at the finish — the run is an ambulance callout. */
export function playSiren(): void {
  quiet(() => {
    for (let i = 0; i < 3; i++) {
      tone(820, 'sine', 0.3, 0.09, i * 0.6)
      tone(610, 'sine', 0.3, 0.09, i * 0.6 + 0.3)
    }
  })
}
