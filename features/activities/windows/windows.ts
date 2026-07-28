import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import {
  WINDOW_APPS,
  WINDOW_TASKS,
  windowsLevel,
  type WindowApp,
  type WindowTask,
  type WindowsLevel,
} from './windows-data.js'

// ── Вікна програм ────────────────────────────────────────────────────────────
// A window from some application appears on the desktop and asks to be closed,
// minimised or maximised. The child clicks the matching title-bar control.
// Ported from the standalone trainer at itnauka.org with the changes a lesson
// needs:
//   1. the run is a fixed number of windows chosen by the teacher's level,
//      instead of an endless stream the teacher had to stop by hand;
//   2. no score, level or streak counters — the result screen reports accuracy;
//   3. no UK/EN switcher: the class surface is Ukrainian;
//   4. no icon font — the window controls and app icons are emoji.
//
// Every window ends in exactly one of correct / wrong / timeout and is followed
// by the next one, so nothing can strand a child mid-lesson.

const WINDOW_W = 420
const WINDOW_H = 320
const AFTER_CORRECT_MS = 600
const AFTER_MISS_MS = 900

function pick<T>(items: readonly T[], exclude?: T): T {
  if (items.length === 1 || exclude === undefined) {
    return items[Math.floor(Math.random() * items.length)]!
  }
  // Avoid repeating the previous item so the drill does not feel stuck
  const pool = items.filter(item => item !== exclude)
  return pool[Math.floor(Math.random() * pool.length)] ?? items[0]!
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const { level, onFinish, onProgress } = options
  const config: WindowsLevel | null = windowsLevel(level)

  container.classList.add('wn-root')

  const startedAt = Date.now()
  let taskIndex = 0
  let correct = 0
  let mistakes = 0
  let finished = false
  let currentTask: WindowTask | null = null
  let lastApp: WindowApp | undefined
  let lastTask: WindowTask | undefined
  let timerId: number | undefined
  let nextId: number | undefined

  const total = config ? config.taskCount : 0

  function result(): ActivityRunResult {
    return {
      correct,
      total: Math.max(1, total),
      mistakes,
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  if (!config) {
    container.innerHTML = '<p class="wn-error">Цю активність не вдалося відкрити. Скажи вчителю.</p>'
    return { snapshot: result, destroy() { container.classList.remove('wn-root'); container.innerHTML = '' } }
  }

  container.innerHTML = `
    <div class="wn-hud">
      <span class="wn-hud__item">Завдання <strong class="wn-hud__count"></strong></span>
      <span class="wn-hud__item wn-hud__correct"></span>
      <span class="wn-hud__item wn-hud__time" aria-live="off"></span>
    </div>
    <div class="wn-timebar"><div class="wn-timebar__fill"></div></div>
    <div class="wn-desktop"></div>
    <p class="wn-toast wn-toast--hidden" role="status"></p>`

  const desktop = container.querySelector<HTMLElement>('.wn-desktop')!
  const hudCount = container.querySelector<HTMLElement>('.wn-hud__count')!
  const hudCorrect = container.querySelector<HTMLElement>('.wn-hud__correct')!
  const hudTime = container.querySelector<HTMLElement>('.wn-hud__time')!
  const bar = container.querySelector<HTMLElement>('.wn-timebar__fill')!
  const toastEl = container.querySelector<HTMLElement>('.wn-toast')!

  function updateHud() {
    hudCount.textContent = `${Math.min(taskIndex + 1, total)} / ${total}`
    hudCorrect.textContent = `✅ ${correct}`
  }

  function toast(msg: string, kind: 'ok' | 'miss') {
    toastEl.textContent = msg
    toastEl.classList.remove('wn-toast--hidden', 'wn-toast--ok', 'wn-toast--miss')
    toastEl.classList.add(kind === 'ok' ? 'wn-toast--ok' : 'wn-toast--miss')
  }

  function hideToast() {
    toastEl.classList.add('wn-toast--hidden')
  }

  // The countdown is driven by a timer, not a CSS transition. The app-wide
  // reduced-motion rule caps every transition at 0.01ms (style.css), which
  // would collapse the bar instantly and leave a child with no idea how much
  // time is left. Ticking it ourselves keeps the countdown readable for
  // everyone, and the seconds are also written out as text.
  function stopTimer() {
    window.clearInterval(timerId)
    timerId = undefined
    bar.style.width = '100%'
  }

  function startTimer() {
    stopTimer()
    const limit = config!.timeLimitMs
    const endsAt = Date.now() + limit
    const paint = () => {
      const left = Math.max(0, endsAt - Date.now())
      bar.style.width = `${(left / limit) * 100}%`
      hudTime.textContent = `⏱ ${Math.ceil(left / 1000)} с`
      if (left <= 0) { stopTimer(); finishTask(null) }
    }
    paint()
    timerId = window.setInterval(paint, 100)
  }

  function spawnWindow() {
    if (finished) return
    hideToast()
    desktop.innerHTML = ''

    const app = pick(WINDOW_APPS, lastApp)
    const task = pick(WINDOW_TASKS, lastTask)
    lastApp = app
    lastTask = task
    currentTask = task

    const rect = desktop.getBoundingClientRect()
    const maxLeft = Math.max(0, rect.width - WINDOW_W)
    const maxTop = Math.max(0, rect.height - WINDOW_H)

    const win = document.createElement('div')
    win.className = 'wn-window'
    win.style.left = `${Math.round(Math.random() * maxLeft)}px`
    win.style.top = `${Math.round(Math.random() * maxTop)}px`
    win.style.setProperty('--wn-app', app.color)

    const header = document.createElement('div')
    header.className = 'wn-window__header'

    const title = document.createElement('div')
    title.className = 'wn-window__title'
    const iconEl = document.createElement('span')
    iconEl.textContent = app.icon
    const nameEl = document.createElement('span')
    nameEl.textContent = app.name
    title.append(iconEl, nameEl)

    const controls = document.createElement('div')
    controls.className = 'wn-window__controls'
    for (const t of WINDOW_TASKS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `wn-control wn-control--${t.id}`
      btn.dataset.action = t.id
      btn.textContent = t.icon
      btn.setAttribute('aria-label', t.control)
      btn.title = t.control
      controls.appendChild(btn)
    }
    header.append(title, controls)

    const body = document.createElement('div')
    body.className = 'wn-window__body'
    const hello = document.createElement('p')
    hello.className = 'wn-window__hello'
    hello.textContent = `Це вікно програми «${app.name}»`
    const card = document.createElement('div')
    card.className = 'wn-window__task'
    const cardTitle = document.createElement('p')
    cardTitle.className = 'wn-window__task-label'
    cardTitle.textContent = 'Твоє завдання'
    const cardText = document.createElement('p')
    cardText.className = 'wn-window__task-text'
    cardText.textContent = task.prompt
    card.append(cardTitle, cardText)
    body.append(hello, card)

    win.append(header, body)
    desktop.appendChild(win)
    makeDraggable(win, header)
    startTimer()
    updateHud()
  }

  /** Windows are draggable by the title bar — moving them is part of the skill. */
  function makeDraggable(win: HTMLElement, header: HTMLElement) {
    let dragging = false
    let offsetX = 0
    let offsetY = 0

    header.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('.wn-control')) return
      dragging = true
      const rect = win.getBoundingClientRect()
      offsetX = e.clientX - rect.left
      offsetY = e.clientY - rect.top
      header.setPointerCapture(e.pointerId)
    })
    header.addEventListener('pointermove', e => {
      if (!dragging) return
      const area = desktop.getBoundingClientRect()
      const x = e.clientX - area.left - offsetX
      const y = e.clientY - area.top - offsetY
      win.style.left = `${Math.max(0, Math.min(area.width - win.offsetWidth, x))}px`
      win.style.top = `${Math.max(0, Math.min(area.height - win.offsetHeight, y))}px`
    })
    const stop = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      try { header.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    }
    header.addEventListener('pointerup', stop)
    header.addEventListener('pointercancel', stop)
  }

  /** action === null means the time ran out. */
  function finishTask(action: string | null) {
    if (finished || !currentTask) return
    stopTimer()
    const win = desktop.querySelector<HTMLElement>('.wn-window')
    const wasCorrect = action === currentTask.id
    currentTask = null

    if (wasCorrect) {
      correct++
      toast('Молодець! ✅', 'ok')
      if (action === 'close') win?.classList.add('wn-window--closing')
      if (action === 'minimize') win?.classList.add('wn-window--minimizing')
      if (action === 'maximize') win?.classList.add('wn-window--maximizing')
    } else {
      mistakes++
      toast(action === null ? 'Час вийшов ⏱' : 'Не та кнопка 🤔', 'miss')
      win?.classList.add('wn-window--wrong')
    }

    updateHud()
    taskIndex++
    onProgress?.(taskIndex, total)

    if (taskIndex >= total) {
      finished = true
      nextId = window.setTimeout(() => onFinish(result()), AFTER_CORRECT_MS + 300)
      return
    }
    nextId = window.setTimeout(spawnWindow, wasCorrect ? AFTER_CORRECT_MS : AFTER_MISS_MS)
  }

  function onDesktopClick(e: MouseEvent) {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('.wn-control')
    if (!btn || !desktop.contains(btn)) return
    finishTask(btn.dataset.action ?? null)
  }

  desktop.addEventListener('click', onDesktopClick)

  updateHud()
  onProgress?.(0, total)
  spawnWindow()

  return {
    snapshot: result,
    destroy() {
      finished = true
      stopTimer()
      window.clearTimeout(nextId)
      desktop.removeEventListener('click', onDesktopClick)
      container.classList.remove('wn-root')
      container.innerHTML = ''
    },
  }
}
