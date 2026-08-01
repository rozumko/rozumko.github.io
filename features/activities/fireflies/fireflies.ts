import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'

const TOTAL = 30
const VISIBLE_AT_ONCE = 5

const COLORS = [
  { name: 'жовтий', value: '#fde047' },
  { name: 'салатовий', value: '#a3e635' },
  { name: 'рожевий', value: '#f472b6' },
  { name: 'блакитний', value: '#38bdf8' },
] as const

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const startedAt = Date.now()
  let issued = 0
  let caught = 0
  let mistakes = 0
  let finished = false

  container.classList.add('ff-root')
  container.innerHTML = `
    <section class="ff-field" aria-label="Ліс зі світлячками">
      <div class="ff-sky" aria-hidden="true"><span>✦</span><span>·</span><span>✦</span><span>·</span><span>✦</span></div>
      <div class="ff-trees" aria-hidden="true">▲ ▲▲ ▲ ▲▲</div>
      <div class="ff-hud"><strong class="ff-count">0 / ${TOTAL}</strong><span>у банці</span></div>
      <p class="ff-message" role="status">Перетягни світлячків у банку</p>
      <div class="ff-jar" aria-label="Банка для світлячків">
        <div class="ff-jar__lid"></div>
        <div class="ff-jar__glass"><span class="ff-jar__label">СЮДИ</span><div class="ff-jar__caught"></div></div>
      </div>
    </section>`

  const field = container.querySelector<HTMLElement>('.ff-field')!
  const jar = container.querySelector<HTMLElement>('.ff-jar')!
  const jarCaught = container.querySelector<HTMLElement>('.ff-jar__caught')!
  const countEl = container.querySelector<HTMLElement>('.ff-count')!
  const messageEl = container.querySelector<HTMLElement>('.ff-message')!

  function result(): ActivityRunResult {
    return {
      correct: caught,
      total: TOTAL,
      mistakes,
      durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  function updateProgress() {
    countEl.textContent = `${caught} / ${TOTAL}`
    options.onProgress?.(caught, TOTAL)
  }

  function isInsideJar(firefly: HTMLElement): boolean {
    const fly = firefly.getBoundingClientRect()
    const target = jar.getBoundingClientRect()
    const cx = fly.left + fly.width / 2
    const cy = fly.top + fly.height / 2
    return cx >= target.left && cx <= target.right && cy >= target.top && cy <= target.bottom
  }

  function addJarGlow(color: string) {
    const glow = document.createElement('span')
    glow.className = 'ff-jar__dot'
    glow.style.setProperty('--ff-color', color)
    glow.style.left = `${10 + Math.random() * 80}%`
    glow.style.top = `${15 + Math.random() * 72}%`
    jarCaught.appendChild(glow)
  }

  function finish() {
    if (finished) return
    finished = true
    field.querySelectorAll('.ff-firefly').forEach(node => node.remove())
    messageEl.textContent = 'Усі 30 світлячків у банці!'
    messageEl.className = 'ff-message ff-message--done'
    jar.classList.add('ff-jar--complete')
    options.onFinish(result())
  }

  function catchFirefly(firefly: HTMLButtonElement, color: string) {
    caught += 1
    firefly.remove()
    addJarGlow(color)
    jar.classList.remove('ff-jar--catch')
    void jar.offsetWidth
    jar.classList.add('ff-jar--catch')
    messageEl.textContent = 'Спіймано! Шукай наступного.'
    messageEl.className = 'ff-message ff-message--ok'
    updateProgress()
    if (caught >= TOTAL) finish()
    else fillField()
  }

  function makeDraggable(firefly: HTMLButtonElement, color: string) {
    let dragging = false
    let offsetX = 0
    let offsetY = 0
    let originX = 0
    let originY = 0

    firefly.addEventListener('pointerdown', event => {
      if (finished || event.button !== 0) return
      event.preventDefault()
      dragging = true
      originX = firefly.offsetLeft
      originY = firefly.offsetTop
      const rect = firefly.getBoundingClientRect()
      offsetX = event.clientX - rect.left
      offsetY = event.clientY - rect.top
      firefly.classList.add('ff-firefly--dragging')
      firefly.style.animation = 'none'
      firefly.setPointerCapture(event.pointerId)
    })

    firefly.addEventListener('pointermove', event => {
      if (!dragging) return
      event.preventDefault()
      const area = field.getBoundingClientRect()
      const x = event.clientX - area.left - offsetX
      const y = event.clientY - area.top - offsetY
      firefly.style.left = `${Math.max(0, Math.min(area.width - firefly.offsetWidth, x))}px`
      firefly.style.top = `${Math.max(0, Math.min(area.height - firefly.offsetHeight, y))}px`
      jar.classList.toggle('ff-jar--over', isInsideJar(firefly))
    })

    const release = (event: PointerEvent, countMiss: boolean) => {
      if (!dragging) return
      dragging = false
      try { firefly.releasePointerCapture(event.pointerId) } catch { /* capture already ended */ }
      firefly.classList.remove('ff-firefly--dragging')
      jar.classList.remove('ff-jar--over')
      if (isInsideJar(firefly)) {
        catchFirefly(firefly, color)
        return
      }
      if (countMiss) {
        mistakes += 1
        messageEl.textContent = 'Майже! Відпусти світлячка над банкою.'
        messageEl.className = 'ff-message ff-message--miss'
      }
      firefly.classList.add('ff-firefly--returning')
      firefly.style.left = `${originX}px`
      firefly.style.top = `${originY}px`
      window.setTimeout(() => {
        firefly.classList.remove('ff-firefly--returning')
        firefly.style.animation = ''
      }, 350)
    }

    firefly.addEventListener('pointerup', event => release(event, true))
    firefly.addEventListener('pointercancel', event => release(event, false))
  }

  function spawnFirefly() {
    if (issued >= TOTAL || finished) return
    const color = COLORS[issued % COLORS.length]!
    const firefly = document.createElement('button')
    firefly.type = 'button'
    firefly.className = `ff-firefly ff-firefly--float-${issued % 3}`
    firefly.setAttribute('aria-label', `${color.name} світлячок`)
    firefly.style.setProperty('--ff-color', color.value)
    firefly.style.left = `${5 + Math.random() * 82}%`
    firefly.style.top = `${8 + Math.random() * 48}%`
    firefly.innerHTML = '<span class="ff-firefly__wing">◜</span><span class="ff-firefly__body">●</span><span class="ff-firefly__wing">◝</span>'
    issued += 1
    field.appendChild(firefly)
    makeDraggable(firefly, color.value)
  }

  function fillField() {
    while (!finished && issued < TOTAL && field.querySelectorAll('.ff-firefly').length < VISIBLE_AT_ONCE) {
      spawnFirefly()
    }
  }

  updateProgress()
  fillField()

  return {
    snapshot: result,
    destroy() {
      finished = true
      container.textContent = ''
      container.classList.remove('ff-root')
    },
  }
}
