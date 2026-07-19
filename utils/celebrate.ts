// Kid-friendly celebration for mission finish screens: canvas confetti +
// a short WebAudio victory jingle. No external libs, no audio files.
// Respects prefers-reduced-motion (confetti is skipped, sound still plays).

const CONFETTI_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']
const CONFETTI_COUNT = 120
const CONFETTI_DURATION_MS = 2600

interface ConfettiPiece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  angle: number
  spin: number
}

/** Full-screen confetti burst. Auto-removes its canvas when done. */
export function launchConfetti(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) { canvas.remove(); return }

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  ctx.scale(dpr, dpr)

  const w = window.innerWidth
  const h = window.innerHeight
  const pieces: ConfettiPiece[] = Array.from({ length: CONFETTI_COUNT }, () => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.5,
    vx: (Math.random() - 0.5) * 2.2,
    vy: 2 + Math.random() * 3.2,
    size: 6 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? '#3b82f6',
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.25,
  }))

  const start = performance.now()
  function frame(now: number) {
    const elapsed = now - start
    if (elapsed > CONFETTI_DURATION_MS) { canvas.remove(); return }
    ctx!.clearRect(0, 0, w, h)
    // Fade out over the last quarter of the animation
    ctx!.globalAlpha = elapsed > CONFETTI_DURATION_MS * 0.75
      ? 1 - (elapsed - CONFETTI_DURATION_MS * 0.75) / (CONFETTI_DURATION_MS * 0.25)
      : 1
    for (const p of pieces) {
      p.x += p.vx
      p.y += p.vy
      p.angle += p.spin
      ctx!.save()
      ctx!.translate(p.x, p.y)
      ctx!.rotate(p.angle)
      ctx!.fillStyle = p.color
      ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx!.restore()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

/**
 * Short victory jingle (major arpeggio) via WebAudio.
 * Called right after a user gesture (last answer click), so autoplay is allowed.
 * Any failure (no AudioContext, blocked) is silently ignored.
 */
export function playVictorySound(): void {
  try {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.13
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.4)
    })
    window.setTimeout(() => { void ctx.close() }, 1200)
  } catch {
    // Sound is a bonus — never break the result screen over it.
  }
}
