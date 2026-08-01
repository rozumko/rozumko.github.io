import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'

interface ClickStage {
  name: string
  size: number
  targets: number
  targetTimeMs: number | null
}

const STAGES: readonly ClickStage[] = [
  { name: 'Спокійний старт', size: 4, targets: 8, targetTimeMs: null },
  { name: 'Швидкий пошук', size: 6, targets: 15, targetTimeMs: 2000 },
  { name: 'Точний спринт', size: 8, targets: 20, targetTimeMs: 1500 },
]

const TOTAL = STAGES.reduce((sum, stage) => sum + stage.targets, 0)

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const startedAt = Date.now()
  let stageIndex = 0
  let stageDone = 0
  let resolved = 0
  let correct = 0
  let mistakes = 0
  let activeCell = -1
  let previousCell = -1
  let finished = false
  let targetTimer: number | undefined
  let nextTimer: number | undefined

  container.classList.add('pc-root')
  container.innerHTML = `
    <section class="pc-shell">
      <div class="pc-hud">
        <span class="pc-stage"></span>
        <span class="pc-progress"></span>
        <span class="pc-score"></span>
      </div>
      <div class="pc-time" aria-hidden="true"><div class="pc-time__fill"></div></div>
      <div class="pc-board" role="grid" aria-label="Поле для тренування кліку"></div>
      <p class="pc-message" role="status"></p>
    </section>`

  const board = container.querySelector<HTMLElement>('.pc-board')!
  const stageEl = container.querySelector<HTMLElement>('.pc-stage')!
  const progressEl = container.querySelector<HTMLElement>('.pc-progress')!
  const scoreEl = container.querySelector<HTMLElement>('.pc-score')!
  const messageEl = container.querySelector<HTMLElement>('.pc-message')!
  const timeFill = container.querySelector<HTMLElement>('.pc-time__fill')!

  function result(): ActivityRunResult {
    return {
      correct,
      total: TOTAL,
      mistakes,
      durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  function clearTimers() {
    window.clearTimeout(targetTimer)
    window.clearTimeout(nextTimer)
    targetTimer = undefined
    nextTimer = undefined
  }

  function updateHud() {
    const stage = STAGES[stageIndex]
    stageEl.textContent = stage ? `Етап ${stageIndex + 1} з ${STAGES.length}: ${stage.name}` : 'Готово!'
    progressEl.textContent = `${resolved} / ${TOTAL}`
    scoreEl.textContent = `Влучно: ${correct}`
    options.onProgress?.(resolved, TOTAL)
  }

  function chooseCell(cellCount: number): number {
    if (cellCount <= 1) return 0
    let next = previousCell
    while (next === previousCell) next = Math.floor(Math.random() * cellCount)
    previousCell = next
    return next
  }

  function scheduleTarget() {
    if (finished) return
    const stage = STAGES[stageIndex]
    if (!stage) { finish(); return }
    if (stageDone >= stage.targets) { advanceStage(); return }

    activeCell = chooseCell(stage.size * stage.size)
    const cell = board.children[activeCell] as HTMLButtonElement | undefined
    cell?.classList.add('pc-cell--target')
    cell?.setAttribute('aria-label', 'Натисни мене')

    if (stage.targetTimeMs) {
      timeFill.style.setProperty('--pc-target-ms', `${stage.targetTimeMs}ms`)
      timeFill.classList.remove('pc-time__fill--run')
      void timeFill.offsetWidth
      timeFill.classList.add('pc-time__fill--run')
      targetTimer = window.setTimeout(() => resolveTarget(false, true), stage.targetTimeMs)
    } else {
      timeFill.classList.remove('pc-time__fill--run')
      timeFill.style.width = '100%'
    }
  }

  function resolveTarget(hit: boolean, timedOut = false) {
    if (activeCell < 0 || finished) return
    window.clearTimeout(targetTimer)
    targetTimer = undefined
    const cell = board.children[activeCell] as HTMLButtonElement | undefined
    cell?.classList.remove('pc-cell--target')
    cell?.removeAttribute('aria-label')
    activeCell = -1
    stageDone += 1
    resolved += 1
    if (hit) correct += 1
    else mistakes += 1
    messageEl.textContent = hit ? 'Точно!' : timedOut ? 'Час минув — шукай наступну.' : ''
    messageEl.className = `pc-message ${hit ? 'pc-message--ok' : 'pc-message--miss'}`
    updateHud()
    nextTimer = window.setTimeout(scheduleTarget, hit ? 220 : 350)
  }

  function buildGrid() {
    const stage = STAGES[stageIndex]!
    board.textContent = ''
    board.style.setProperty('--pc-size', String(stage.size))
    for (let index = 0; index < stage.size * stage.size; index += 1) {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'pc-cell'
      cell.setAttribute('role', 'gridcell')
      cell.setAttribute('aria-label', 'Порожня клітинка')
      cell.addEventListener('click', () => {
        if (finished || activeCell < 0) return
        if (index === activeCell) resolveTarget(true)
        else {
          mistakes += 1
          cell.classList.remove('pc-cell--wrong')
          void cell.offsetWidth
          cell.classList.add('pc-cell--wrong')
          messageEl.textContent = 'Шукай яскраву клітинку.'
          messageEl.className = 'pc-message pc-message--miss'
        }
      })
      board.appendChild(cell)
    }
  }

  function startStage() {
    stageDone = 0
    activeCell = -1
    previousCell = -1
    messageEl.textContent = stageIndex === 0 ? 'Починай спокійно — тут немає таймера.' : 'Новий етап — клітинка тепер зникає!'
    messageEl.className = 'pc-message'
    buildGrid()
    updateHud()
    nextTimer = window.setTimeout(scheduleTarget, 700)
  }

  function advanceStage() {
    clearTimers()
    stageIndex += 1
    if (stageIndex >= STAGES.length) { finish(); return }
    board.innerHTML = '<div class="pc-break">Етап пройдено! Готуємо наступне поле…</div>'
    nextTimer = window.setTimeout(startStage, 900)
  }

  function finish() {
    if (finished) return
    finished = true
    clearTimers()
    activeCell = -1
    updateHud()
    board.innerHTML = '<div class="pc-break pc-break--done">Три етапи завершено!</div>'
    messageEl.textContent = `Точних натискань: ${correct} із ${TOTAL}.`
    messageEl.className = 'pc-message pc-message--ok'
    options.onFinish(result())
  }

  startStage()

  return {
    snapshot: result,
    destroy() {
      finished = true
      clearTimers()
      container.textContent = ''
      container.classList.remove('pc-root')
    },
  }
}
