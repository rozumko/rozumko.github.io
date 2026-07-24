import './frontend-security.js'
import yearlyPathPlan from './docs/yearly-home-path-v1.md?raw'
import { $, $maybe } from './utils/dom.js'
import { mountSortingGame } from './features/games/sorting-game.js'
import { SORTING_ATTRIBUTES_LEVELS, INFO_SORT_LEVELS, MULTISORT_LEVELS, type SortingLevel } from './features/games/sorting-data.js'
import { loadSortingPack } from './features/games/sorting-pack-loader.js'
import { mountPuzzles } from './features/games/puzzle-engine.js'
import { mountFactOpinion } from './features/games/fact-opinion-game.js'
import { FO_LEVEL1_STATEMENTS, FO_LEVEL2_STATEMENTS } from './features/games/fact-opinion-data.js'
import { mountSimulator } from './features/games/simulator-engine.js'
import { mountLesson } from './features/lessons/lesson-runner.js'
import { loadLesson } from './features/lessons/lesson-loader.js'
import { mountSequenceGame } from './features/games/sequence-game.js'
import { SEQUENCE_SETS_G2 } from './features/games/sequence-data.js'
import { mountScenarios } from './features/games/scenarios-game.js'
import { SCENARIOS_DIGITAL_SAFETY } from './features/games/scenarios-data.js'
import { loadClickTrainerPack, loadFactOpinionPack, loadScenarioPack, loadSequencePack } from './features/games/narrative-pack-loader.js'
import { mountClickTrainer } from './features/games/click-trainer.js'
import { CLICK_TRAINER_COMPUTER_PARTS } from './features/games/click-trainer-data.js'
import { HARDWARE_SCENARIO, SOFTWARE_SCENARIO } from './features/games/simulator-data.js'
import { loadSimulatorScenario } from './features/games/simulator-content-loader.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import { shuffleDeck } from './features/missions/question-shuffle.js'
import { loadStaticQuestions } from './features/missions/static-questions.js'
import {
  PATHS_BY_GRADE, isUnlocked,
  type PathPoint, type PathActivity, type PathActivityStep,
} from './features/path/path-data.js'
import { loadGradeMap } from './features/path/path-loader.js'
import { createProgressStore } from './features/path/progress-store.js'
import { syncPathProgress } from './features/path/path-sync.js'
import { renderMascot } from './features/path/mascot.js'
import { TOPIC_SHORT } from './features/missions/topics.js'
import {
  getParentPathProgress, getParentSession, submitParentPathProgress,
} from './features/api/client.js'
import {
  fromSortingSummary, fromPuzzleSummary, fromMissionSummary, fromGameSummary, fromLessonSummary,
  type ActivityResult, type ActivityContext,
} from './features/path/activity-result.js'
import { getSavedGrade } from './utils/grade.js'

// Home learning paths. Progress is always written locally;
// для явно вибраного батьком профілю черга синхронізується з backend snapshot.
// Місії тут practice-режим (ключі в бандлі → локальний фідбек, як у School).

const SORTING_GAMES: Record<string, SortingLevel[]> = {
  attributes: SORTING_ATTRIBUTES_LEVELS,
  infosort:   INFO_SORT_LEVELS,
  multisort:  MULTISORT_LEVELS,
}
const EDGE_NODE_GAP = 1.5

const savedGrade = getSavedGrade()
const searchParams = new URLSearchParams(window.location.search)
const queryGradeRaw = searchParams.get('grade')
const queryGrade = queryGradeRaw !== null ? Number(queryGradeRaw) : null
const isYearlyPreview = searchParams.get('preview') === 'yearly'
const requestedGrade = queryGrade !== null && Number.isInteger(queryGrade) && queryGrade > 0
  ? queryGrade
  : savedGrade
const requestedMap = PATHS_BY_GRADE[requestedGrade]
// Вбудована карта рендериться одразу (перший візит/офлайн), а бандл
// public/path/ (експорт з БД) підміняє її, щойно довантажиться — свіжі
// правки з адмінки доїжджають без релізу коду (див. loadGradeMap нижче).
let map = requestedMap ?? PATHS_BY_GRADE[savedGrade]!
let pendingMap: typeof map | null = null
const activeChildProfileId = getParentSession()?.activeChildProfileId ?? null
const store = createProgressStore(window.localStorage, activeChildProfileId ?? 'local')
let syncInFlight: Promise<void> = Promise.resolve()
const pathSyncApi = { getProgress: getParentPathProgress, submitProgress: submitParentPathProgress }

function schedulePathSync() {
  if (!activeChildProfileId) return
  syncInFlight = syncInFlight.then(async () => {
    await syncPathProgress(store, map, activeChildProfileId, pathSyncApi)
    renderMap()
  }).catch(() => {
    // Offline/auth failure: the local queue remains intact for the next visit.
  })
}

// ── DOM ───────────────────────────────────────────────────────
const mapScreen    = $('path-map-screen')
const nodesBox     = $('path-nodes')
const edgesSvg     = $('path-edges')
const errorEl      = $('path-error')
const activityEl   = $('path-activity')
const activityBar  = $('path-activity-title')
const lessonRoot   = $('path-lesson-root')
const bonusRoot    = $('path-bonus-root')
const sortingRoot  = $('path-sorting-root')
const puzzlesRoot  = $('path-puzzles-root')
const foRoot       = $('path-fo-root')
const missionQuiz  = $('mission-quiz')
const doneEl       = $('path-done')
const doneMascot   = $('path-done-mascot')
const doneStats    = $('path-done-stats')
const doneSkills   = $('path-done-skills')
const greetingEl   = $('path-greeting')
const parentGate   = $('path-parent-gate')
const parentGateLink = $<HTMLAnchorElement>('path-parent-gate-link')
const doneSave     = $('path-done-save')
const doneSaveLink = $<HTMLAnchorElement>('path-done-save-link')

const els: MissionElements = {
  progressText: $('quiz-progress-text'),
  progressBar:  $('quiz-progress-bar'),
  questionText: $('quiz-question-text'),
  image:        $maybe<HTMLImageElement>('quiz-image'),
  codeBlock:    $maybe('quiz-code-block'),
  options:      $('quiz-options'),
  feedback:     $('quiz-feedback'),
  explanation:  $('quiz-explanation'),
  nextBtn:      $<HTMLButtonElement>('quiz-next-btn'),
}

function show(el: HTMLElement) { el.classList.remove('hidden') }
function hide(el: HTMLElement) { el.classList.add('hidden') }

interface YearlyPreviewPoint {
  grade: number
  no: number
  id: string
  type: string
  title: string
  topic: string
  status: 'ready' | 'candidate' | 'placeholder'
}

interface YearlyPreviewSlot {
  x: number
  y: number
  label: 'left' | 'right'
}

const YEARLY_PREVIEW_ROUTES: readonly (readonly YearlyPreviewSlot[])[] = [
  [
    { x: 50, y: 10, label: 'right' },
    { x: 26, y: 23, label: 'left' },
    { x: 68, y: 36, label: 'right' },
    { x: 78, y: 50, label: 'left' },
    { x: 42, y: 63, label: 'left' },
    { x: 20, y: 77, label: 'right' },
    { x: 58, y: 88, label: 'right' },
    { x: 82, y: 72, label: 'left' },
  ],
  [
    { x: 18, y: 22, label: 'right' },
    { x: 38, y: 12, label: 'right' },
    { x: 60, y: 20, label: 'left' },
    { x: 80, y: 36, label: 'left' },
    { x: 64, y: 54, label: 'left' },
    { x: 38, y: 60, label: 'right' },
    { x: 22, y: 78, label: 'right' },
    { x: 52, y: 88, label: 'right' },
  ],
  [
    { x: 24, y: 12, label: 'right' },
    { x: 48, y: 24, label: 'right' },
    { x: 76, y: 18, label: 'left' },
    { x: 62, y: 40, label: 'left' },
    { x: 34, y: 48, label: 'right' },
    { x: 18, y: 66, label: 'right' },
    { x: 44, y: 82, label: 'right' },
    { x: 76, y: 72, label: 'left' },
  ],
  [
    { x: 50, y: 12, label: 'right' },
    { x: 72, y: 24, label: 'left' },
    { x: 80, y: 45, label: 'left' },
    { x: 58, y: 58, label: 'left' },
    { x: 36, y: 48, label: 'right' },
    { x: 22, y: 65, label: 'right' },
    { x: 42, y: 84, label: 'right' },
    { x: 70, y: 78, label: 'left' },
  ],
  [
    { x: 18, y: 18, label: 'right' },
    { x: 38, y: 32, label: 'right' },
    { x: 30, y: 54, label: 'right' },
    { x: 52, y: 70, label: 'right' },
    { x: 74, y: 58, label: 'left' },
    { x: 82, y: 34, label: 'left' },
    { x: 62, y: 18, label: 'left' },
    { x: 48, y: 88, label: 'right' },
  ],
] as const

function previewSlots(islandIndex: number, pointCount: number): readonly YearlyPreviewSlot[] {
  return YEARLY_PREVIEW_ROUTES[islandIndex % YEARLY_PREVIEW_ROUTES.length].slice(0, pointCount)
}

function previewRoutePath(slots: readonly YearlyPreviewSlot[]): string {
  return slots
    .map((slot, index) => `${index === 0 ? 'M' : 'L'} ${slot.x} ${slot.y}`)
    .join(' ')
}

function parseYearlyPathPlan(raw: string): Map<number, YearlyPreviewPoint[]> {
  const result = new Map<number, YearlyPreviewPoint[]>()
  for (const grade of [1, 2, 3, 4]) result.set(grade, [])
  for (const line of raw.split(/\r?\n/)) {
    const trimmedLine = line.trimStart()
    if (!trimmedLine.startsWith('|')) continue
    const cells = trimmedLine.split('|').slice(1, -1).map(cell => cell.trim())
    const status = cells[5]
    if (
      cells.length < 6
      || !/^\d+$/.test(cells[0])
      || !['ready', 'candidate', 'placeholder'].includes(status)
    ) continue
    const id = cells[1].replace(/`/g, '')
    const rowGrade = Number(id.match(/^g([1-4])-/)?.[1])
    if (!Number.isInteger(rowGrade) || !result.has(rowGrade)) continue
    result.get(rowGrade)!.push({
      grade: rowGrade,
      no: Number(cells[0]),
      id,
      type: cells[2],
      title: cells[3],
      topic: cells[4],
      status: status as YearlyPreviewPoint['status'],
    })
  }
  return result
}

function previewTrackClass(point: YearlyPreviewPoint): string {
  if (point.id.includes('final') || point.id.includes('fact-opinion')) return 'yearly-point--cross'
  if (point.id.includes('ai')) return 'yearly-point--ai'
  if (/(ct|algo|logic|pattern|debug|repetition|review-algo)/.test(point.id)) return 'yearly-point--think'
  return 'yearly-point--inf'
}

function previewIcon(point: YearlyPreviewPoint): string {
  const id = point.id
  if (id.includes('final')) return '🏁'
  if (id.includes('review')) return '🔁'
  if (id.includes('check')) return '🧭'
  if (id.includes('ai')) return '✨'
  if (id.includes('safety')) return '🛡️'
  if (/(data|table|chart)/.test(id)) return '📊'
  if (/(computer|device|file|software|assembly|tools)/.test(id)) return '💻'
  if (/(internet|network|search)/.test(id)) return '🌐'
  if (/(algo|ct|logic|pattern|debug|repetition)/.test(id)) return '🧩'
  if (/(fact|info)/.test(id)) return '💬'
  return '●'
}

function previewStatusLabel(status: YearlyPreviewPoint['status']): string {
  if (status === 'ready') return 'є контент'
  if (status === 'candidate') return 'можна зібрати'
  return 'ескіз'
}

function setupYearlyIslandSlider(
  slider: HTMLElement,
  track: HTMLElement,
  dots: HTMLButtonElement[],
  prev: HTMLButtonElement,
  next: HTMLButtonElement,
) {
  let activeIsland = 0
  const islands = track.querySelectorAll<HTMLElement>('.yearly-island')
  const setActiveIsland = (index: number) => {
    activeIsland = Math.max(0, Math.min(index, islands.length - 1))
    track.style.setProperty('--active-island', String(activeIsland))
    prev.disabled = activeIsland === 0
    next.disabled = activeIsland === islands.length - 1
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle('yearly-island-slider__dot--active', dotIndex === activeIsland)
      dot.setAttribute('aria-current', dotIndex === activeIsland ? 'step' : 'false')
    })
    slider.setAttribute('data-active-island', String(activeIsland + 1))
  }
  prev.addEventListener('click', () => setActiveIsland(activeIsland - 1))
  next.addEventListener('click', () => setActiveIsland(activeIsland + 1))
  dots.forEach((dot, dotIndex) => dot.addEventListener('click', () => setActiveIsland(dotIndex)))
  slider.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setActiveIsland(activeIsland - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setActiveIsland(activeIsland + 1)
    }
  })
  setActiveIsland(0)
}

function renderYearlyPreview() {
  document.body.classList.add('yearly-preview-page')
  setActivityMode(false)
  hide(activityEl)
  hide(doneEl)
  parentGate.classList.add('hidden')

  const parsed = parseYearlyPathPlan(yearlyPathPlan)
  const selectedGrade = queryGrade !== null && Number.isInteger(queryGrade) && queryGrade >= 1 && queryGrade <= 4
    ? queryGrade
    : null
  const grades = selectedGrade ? [selectedGrade] : [1, 2, 3, 4]

  mapScreen.classList.add('yearly-preview')
  mapScreen.innerHTML = ''

  const title = document.createElement('h1')
  title.className = 'app-title'
  title.textContent = selectedGrade ? `Повний шлях ${selectedGrade} класу` : 'Повний річний шлях'
  const subtitle = document.createElement('p')
  subtitle.className = 'app-subtitle yearly-preview__subtitle'
  subtitle.textContent = 'Усі точки відкриті для огляду; ескізи показують місця майбутнього контенту.'

  const nav = document.createElement('nav')
  nav.className = 'yearly-preview__nav'
  nav.setAttribute('aria-label', 'Класи')
  for (const grade of [1, 2, 3, 4]) {
    const link = document.createElement('a')
    link.className = 'yearly-preview__grade-link'
    if (selectedGrade === grade) link.classList.add('yearly-preview__grade-link--active')
    link.href = `path.html?preview=yearly&grade=${grade}`
    link.textContent = `${grade} клас`
    nav.append(link)
  }
  if (selectedGrade) {
    const all = document.createElement('a')
    all.className = 'yearly-preview__grade-link'
    all.href = 'path.html?preview=yearly'
    all.textContent = 'Усі класи'
    nav.append(all)
  }

  mapScreen.append(title, subtitle, nav)

  for (const grade of grades) {
    const points = parsed.get(grade) ?? []
    const section = document.createElement('section')
    section.className = 'yearly-grade'
    section.id = `yearly-grade-${grade}`
    section.setAttribute('aria-labelledby', `yearly-grade-${grade}-title`)

    const gradeHeader = document.createElement('div')
    gradeHeader.className = 'yearly-grade__header'
    const gradeTitle = document.createElement('h2')
    gradeTitle.id = `yearly-grade-${grade}-title`
    gradeTitle.textContent = `${grade} клас`
    const gradeMeta = document.createElement('p')
    gradeMeta.textContent = `${points.length} точок · 5 островів приблизно по 8 занять`
    gradeHeader.append(gradeTitle, gradeMeta)
    section.append(gradeHeader)

    const islandCount = Math.ceil(points.length / 8)
    const slider = document.createElement('div')
    slider.className = 'yearly-island-slider'
    slider.tabIndex = 0
    slider.setAttribute('aria-label', `Острови ${grade} класу`)

    const sliderControls = document.createElement('div')
    sliderControls.className = 'yearly-island-slider__controls'
    const prev = document.createElement('button')
    prev.type = 'button'
    prev.className = 'yearly-island-slider__arrow'
    prev.setAttribute('aria-label', 'Попередній острів')
    prev.textContent = '‹'
    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'yearly-island-slider__arrow'
    next.setAttribute('aria-label', 'Наступний острів')
    next.textContent = '›'
    const dotsWrap = document.createElement('div')
    dotsWrap.className = 'yearly-island-slider__dots'
    const dots: HTMLButtonElement[] = []
    for (let islandIndex = 0; islandIndex < islandCount; islandIndex += 1) {
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = 'yearly-island-slider__dot'
      dot.textContent = String(islandIndex + 1)
      dot.setAttribute('aria-label', `Показати острів ${islandIndex + 1}`)
      dots.push(dot)
      dotsWrap.append(dot)
    }
    sliderControls.append(prev, dotsWrap, next)

    const viewport = document.createElement('div')
    viewport.className = 'yearly-island-slider__viewport'
    const track = document.createElement('div')
    track.className = 'yearly-island-slider__track'

    for (let islandIndex = 0; islandIndex < islandCount; islandIndex += 1) {
      const slice = points.slice(islandIndex * 8, islandIndex * 8 + 8)
      const island = document.createElement('section')
      island.className = 'yearly-island'
      island.setAttribute('aria-label', `${grade} клас, острів ${islandIndex + 1}`)

      const islandHeader = document.createElement('div')
      islandHeader.className = 'yearly-island__header'
      const islandTitle = document.createElement('h3')
      islandTitle.textContent = `Острів ${islandIndex + 1}`
      const range = document.createElement('span')
      range.textContent = `точки ${slice[0]?.no ?? 0}-${slice[slice.length - 1]?.no ?? 0}`
      islandHeader.append(islandTitle, range)

      const path = document.createElement('div')
      path.className = 'yearly-island__path'
      const slots = previewSlots(islandIndex, slice.length)
      const routeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      routeSvg.classList.add('yearly-island__route')
      routeSvg.setAttribute('viewBox', '0 0 100 100')
      routeSvg.setAttribute('preserveAspectRatio', 'none')
      routeSvg.setAttribute('aria-hidden', 'true')
      routeSvg.innerHTML = `<path d="${previewRoutePath(slots)}" />`
      path.append(routeSvg)

      for (const [pointIndex, point] of slice.entries()) {
        const slot = slots[pointIndex]
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `yearly-point ${previewTrackClass(point)} yearly-point--${point.status} yearly-point--label-${slot.label}`
        button.style.setProperty('--map-x', `${slot.x}%`)
        button.style.setProperty('--map-y', `${slot.y}%`)
        button.setAttribute('aria-label', `${point.no}. ${point.title} — ${point.type}, ${previewStatusLabel(point.status)}`)
        button.innerHTML = `
          <span class="yearly-point__number" aria-hidden="true">${point.no}</span>
          <span class="yearly-point__visual" aria-hidden="true">${previewIcon(point)}</span>
          <span class="yearly-point__caption">
            <span class="yearly-point__title">${point.title}</span>
            <span class="yearly-point__meta">${point.type} · ${point.topic}</span>
            <span class="yearly-point__status">${previewStatusLabel(point.status)}</span>
          </span>
        `
        button.addEventListener('click', () => {
          button.closest('.yearly-grade')?.querySelectorAll('.yearly-point--selected')
            .forEach(node => node.classList.remove('yearly-point--selected'))
          button.classList.add('yearly-point--selected')
        })
        path.append(button)
      }
      island.append(islandHeader, path)
      track.append(island)
    }
    viewport.append(track)
    slider.append(sliderControls, viewport)
    section.append(slider)
    setupYearlyIslandSlider(slider, track, dots, prev, next)
    mapScreen.append(section)
  }
}

if (isYearlyPreview) {
  renderYearlyPreview()
} else if (!requestedMap) {
  $('path-subtitle').textContent = `Карта ${requestedGrade} класу ще готується — повертайся незабаром!`
  document.getElementById('path-map')!.classList.add('path-map--unavailable')
  parentGate.classList.add('hidden')
  const homeLink = document.createElement('a')
  homeLink.href = 'home.html'
  homeLink.className = 'kid-action path-home-link'
  homeLink.textContent = '← На головну'
  $('path-map-screen').appendChild(homeLink)
} else {
  $('path-subtitle').textContent = `${map.title} · проходь точки — відкривай нові!`
  parentGateLink.href = `parent.html?continuePath=grade-${map.grade}`
  doneSaveLink.href = `parent.html?continuePath=grade-${map.grade}`
}

// ── Рендер карти ──────────────────────────────────────────────
function trackClass(p: PathPoint): string {
  if (p.curriculum.length > 1) return p.curriculum.length > 2 ? 'path-node--cross-all' : 'path-node--cross'
  switch (p.curriculum[0]?.track) {
    case 'informatics': return 'path-node--inf'
    case 'ai-basics':   return 'path-node--ai'
    default:            return 'path-node--think'
  }
}

function edgeEndpoint(from: PathPoint, to: PathPoint, offset: number) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (!length) return { x: from.x, y: from.y }
  const safeOffset = Math.min(offset, length / 2)
  return {
    x: from.x + (dx / length) * safeOffset,
    y: from.y + (dy / length) * safeOffset,
  }
}

function edgePath(from: PathPoint, to: PathPoint): string {
  const start = edgeEndpoint(from, to, EDGE_NODE_GAP)
  const end = edgeEndpoint(to, from, EDGE_NODE_GAP)
  const midY = (start.y + end.y) / 2
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} C ${start.x.toFixed(2)} ${midY.toFixed(2)}, ${end.x.toFixed(2)} ${midY.toFixed(2)}, ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

function renderMap() {
  const completed = new Set(store.completedIds())
  const mapPointIds = new Set(map.points.map(p => p.id))
  const completedInMap = [...completed].filter(id => mapPointIds.has(id))
  const anonymousGate = !activeChildProfileId && completedInMap.length > 0
  parentGate.classList.toggle('hidden', !anonymousGate)

  // Маскот вітає лише на свіжій карті (перший візит) — далі не захаращуємо.
  if (completedInMap.length === 0) {
    greetingEl.classList.remove('hidden')
    renderMascot(greetingEl, { message: 'Привіт! Я Розумко 🤖 Тисни на кружечок, що світиться, — і почнемо пригоду!', side: 'left' })
  } else {
    greetingEl.classList.add('hidden')
    greetingEl.textContent = ''
  }

  // Ребра: від кожної передумови до точки. Координати = відсотки viewBox 100×100.
  edgesSvg.innerHTML = map.points.flatMap(p =>
    p.unlockAfter.map(depId => {
      const from = map.points.find(x => x.id === depId)
      if (!from) return ''
      const open = completed.has(depId)
      return `<path d="${edgePath(from, p)}"
        class="path-edge ${open ? 'path-edge--open' : ''}" />`
    }),
  ).join('')

  nodesBox.innerHTML = ''
  for (const p of map.points) {
    const progress = store.getPoint(p.id)
    const done = progress?.status === 'completed'
    const started = progress?.status === 'started'
    const open = !anonymousGate && isUnlocked(p, completed)
    const stars = progress?.bestStars ?? 0

    const btn = document.createElement('button')
    btn.type = 'button'
    const stateClass = done ? 'path-node--done'
      : started ? 'path-node--started'
      : open ? 'path-node--open'
      : 'path-node--locked'
    btn.className = `path-node ${trackClass(p)} ${stateClass}`
    btn.style.left = `${p.x}%`
    btn.style.top = `${p.y}%`
    btn.disabled = !open && !done
    const state = done
      ? `виконано${stars ? `, ${stars} з 3 зірок` : ''}`
      : started ? 'розпочато'
      : open ? 'доступно' : 'попереду'
    btn.setAttribute('aria-label', `${p.title} — ${state}`)
    btn.innerHTML = `
      <span class="path-node__badge" aria-hidden="true">${done ? '✓' : p.icon}</span>
      <span class="path-node__label" aria-hidden="true">${p.title}</span>
      ${done && stars ? `<span class="path-node__stars" aria-hidden="true">${'⭐'.repeat(stars)}</span>` : ''}`
    if (open || done) btn.addEventListener('click', () => { void startPoint(p) })
    nodesBox.appendChild(btn)
  }
}

// ── Запуск активності точки ───────────────────────────────────
let activeRun = 0

function setActivityMode(active: boolean) {
  document.documentElement.classList.toggle('path-activity-active', active)
  document.body.classList.toggle('path-activity-active', active)
}

function activityContext(p: PathPoint, step: PathActivityStep, contentVersion?: number): ActivityContext {
  return {
    activityId: `path:${p.id}:${step.id}`,
    activityVersion: step.version,
    ...(contentVersion !== undefined ? { contentVersion } : {}),
    grade: map.grade,
    curriculum: p.curriculum,
  }
}

async function startPoint(p: PathPoint) {
  const run = ++activeRun
  errorEl.textContent = ''
  hide(mapScreen)
  hide(doneEl)
  show(activityEl)
  setActivityMode(true)

  const requiredSteps = p.activities.filter(step => step.required)
  if (!requiredSteps.length) {
    backToMap()
    errorEl.textContent = 'Для цієї точки ще не додано обов’язкової активності.'
    return
  }
  store.startPoint(p.id)

  try {
    await startActivityStep(p, requiredSteps, 0, [], run, results => offerBonus(p, results, run))
  } catch (err) {
    if (run !== activeRun) return
    backToMap()
    errorEl.textContent = (err as Error).message
  }
}

/**
 * Після обовʼязкових кроків — вибір бонусних (required: false): дитина може
 * зіграти будь-які з них або одразу завершити точку. Бонусні результати
 * їдуть у ТОМУ Ж батчі (сервер приймає required ⊎ підмножину optional);
 * зірки точки сервер рахує лише з обовʼязкових.
 */
function offerBonus(p: PathPoint, results: ActivityResult[], run: number) {
  if (run !== activeRun) return
  const played = new Set(results.map(result => result.activityId))
  const bonusSteps = p.activities.filter(step =>
    !step.required && !played.has(`path:${p.id}:${step.id}`))
  if (!bonusSteps.length) {
    finishPoint(p, results, run)
    return
  }

  clearActivityRoots()
  hide(lessonRoot); hide(bonusRoot); hide(sortingRoot); hide(puzzlesRoot); hide(foRoot); hide(missionQuiz)
  activityBar.textContent = `${p.icon} ${p.title}`
  show(bonusRoot)
  bonusRoot.innerHTML = `
    <div class="path-bonus">
      <p class="path-bonus__icon" aria-hidden="true">🎁</p>
      <h2 class="path-bonus__title">Обовʼязкову частину пройдено!</h2>
      <p class="path-bonus__hint">Хочеш спробувати бонусні завдання? Вони не впливають на зірки — це просто для розваги.</p>
      <div class="path-bonus__list" role="group" aria-label="Бонусні активності"></div>
      <button type="button" class="kid-action path-bonus__finish">Завершити точку →</button>
    </div>`
  const list = bonusRoot.querySelector<HTMLElement>('.path-bonus__list')!
  for (const step of bonusSteps) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'path-bonus__item'
    btn.textContent = `🎯 ${step.title}`
    btn.addEventListener('click', () => {
      startActivityStep(p, [step], 0, results, run, next => offerBonus(p, next, run), true)
        .catch((err: unknown) => {
          if (run !== activeRun) return
          backToMap()
          errorEl.textContent = (err as Error).message
        })
    })
    list.appendChild(btn)
  }
  bonusRoot.querySelector<HTMLButtonElement>('.path-bonus__finish')!
    .addEventListener('click', () => finishPoint(p, results, run))
}

async function startActivityStep(
  p: PathPoint,
  steps: PathActivityStep[],
  index: number,
  results: ActivityResult[],
  run: number,
  onDone: (results: ActivityResult[]) => void,
  bonus = false,
) {
  if (run !== activeRun) return
  if (index >= steps.length) {
    onDone(results)
    return
  }

  const step = steps[index]
  const a: PathActivity = step.activity
  clearActivityRoots()
  hide(lessonRoot); hide(bonusRoot); hide(sortingRoot); hide(puzzlesRoot); hide(foRoot); hide(missionQuiz)
  activityBar.textContent = bonus
    ? `${p.icon} ${p.title} · Бонус: ${step.title}`
    : steps.length > 1
    ? `${p.icon} ${p.title} · ${index + 1}/${steps.length}: ${step.title}`
    : `${p.icon} ${p.title}`

  // Помилка наступного кроку (напр. недоступний бандл місії чи уроку) має
  // повертати на карту, як у startPoint — інакше unhandled rejection і
  // застиглий екран «Готуємо…».
  const complete = (result: ActivityResult) => {
    if (run !== activeRun) return
    startActivityStep(p, steps, index + 1, [...results, result], run, onDone, bonus).catch((err: unknown) => {
      if (run !== activeRun) return
      backToMap()
      errorEl.textContent = (err as Error).message
    })
  }

  if (a.kind === 'lesson') {
    show(lessonRoot)
    const lesson = await loadLesson(a.lessonId)
    if (run !== activeRun) return
    mountLesson(lessonRoot, lesson, {
      // Точка вже проходилась — теорію можна пропустити (повторний візит).
      allowSkip: store.isCompleted(p.id),
      onComplete: s => complete(fromLessonSummary(s, activityContext(p, step, lesson.version))),
    })
  } else if (a.kind === 'sequence') {
    show(foRoot)
    const sets = await loadSequencePack('algorithms-g2', SEQUENCE_SETS_G2)
    if (run !== activeRun) return
    mountSequenceGame(foRoot, sets, {
      round: a.count,
      onComplete: s => complete(fromGameSummary(s, activityContext(p, step))),
    })
  } else if (a.kind === 'scenarios') {
    show(foRoot)
    const items = await loadScenarioPack('digital-safety', SCENARIOS_DIGITAL_SAFETY)
    if (run !== activeRun) return
    mountScenarios(foRoot, items, {
      round: a.count,
      onComplete: s => complete(fromGameSummary(s, activityContext(p, step))),
    })
  } else if (a.kind === 'sorting') {
    show(sortingRoot)
    const levels = await loadSortingPack(a.game, SORTING_GAMES[a.game])
    if (run !== activeRun) return
    mountSortingGame(sortingRoot, levels, {
      onComplete: s => complete(fromSortingSummary(s, activityContext(p, step))),
    })
  } else if (a.kind === 'puzzles') {
    show(puzzlesRoot)
    mountPuzzles(puzzlesRoot, map.grade, a.count ?? 5, {
      onComplete: s => complete(fromPuzzleSummary(s, activityContext(p, step))),
    })
  } else if (a.kind === 'fact-opinion') {
    show(foRoot)
    const statements = await loadFactOpinionPack(
      a.level === 1 ? 'level1' : 'level2',
      a.level === 1 ? FO_LEVEL1_STATEMENTS : FO_LEVEL2_STATEMENTS,
    )
    if (run !== activeRun) return
    mountFactOpinion(foRoot, statements, {
      onComplete: s => complete(fromGameSummary(s, activityContext(p, step))),
    })
  } else if (a.kind === 'click-trainer') {
    show(foRoot)
    const rounds = await loadClickTrainerPack(a.game, CLICK_TRAINER_COMPUTER_PARTS)
    if (run !== activeRun) return
    mountClickTrainer(foRoot, rounds, {
      round: a.count,
      onComplete: s => complete(fromGameSummary(s, activityContext(p, step))),
    })
  } else if (a.kind === 'simulator') {
    show(foRoot)
    const scenario = await loadSimulatorScenario(a.scenario === 'hardware' ? HARDWARE_SCENARIO : SOFTWARE_SCENARIO)
    if (run !== activeRun) return
    mountSimulator(foRoot, scenario, {
      onComplete: s => complete(fromGameSummary(
        { correct: Math.max(0, s.steps - s.mistakes), total: Math.max(1, s.steps), stars: s.stars },
        activityContext(p, step),
      )),
    })
  } else {
    show(missionQuiz)
    els.questionText.textContent = 'Готуємо місію…'
    els.options.innerHTML = ''
    const questions = await loadMissionQuestions(a)
    if (run !== activeRun) return
    // Scoring is local (practice pool): shuffleDeck remaps `correct` itself.
    const deck = shuffleDeck(questions, `path-${Date.now()}-${Math.random()}`)
    runMission(els, deck.questions, {
      showExplanation: true,
      onComplete: s => complete(fromMissionSummary(s, activityContext(p, step))),
    })
  }
}

// Поступове послаблення фільтрів (як home-demo): topic → track → будь-які.
async function loadMissionQuestions(a: Extract<PathActivity, { kind: 'mission' }>) {
  const count = a.count ?? 6
  if (a.tracks?.length) {
    const baseCount = Math.floor(count / a.tracks.length)
    const remainder = count % a.tracks.length
    const mixed: Awaited<ReturnType<typeof loadStaticQuestions>> = []
    for (const [index, track] of a.tracks.entries()) {
      const trackCount = baseCount + (index < remainder ? 1 : 0)
      const questions = await loadStaticQuestions(map.grade, { count: trackCount, track })
      if (questions.length < trackCount) {
        throw new Error('Для фінальної місії поки недостатньо завдань з усіх трьох напрямів.')
      }
      mixed.push(...questions.slice(0, trackCount))
    }
    for (let i = mixed.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[mixed[i], mixed[j]] = [mixed[j], mixed[i]]
    }
    return mixed
  }
  const attempts = [
    { count, track: a.track ?? null, topic: a.topic ?? null },
    { count, track: a.track ?? null },
    { count },
  ]
  const MIN = Math.min(count, 3)
  let picked: Awaited<ReturnType<typeof loadStaticQuestions>> = []
  for (const pick of attempts) {
    try { picked = await loadStaticQuestions(map.grade, pick) } catch { picked = [] }
    if (picked.length >= MIN) break
  }
  if (!picked.length) throw new Error('Не вдалося завантажити завдання. Перевір інтернет і спробуй ще раз.')
  return picked
}

// ── Завершення точки ──────────────────────────────────────────
function finishPoint(p: PathPoint, results: ActivityResult[], run: number) {
  if (run !== activeRun) return
  const progress = store.recordResults(p.id, results, map.version)
  schedulePathSync()
  hide(activityEl)
  clearActivityRoots()

  $('path-done-title').textContent = p.title
  // Місії home-карти показують локальний фідбек (practice), тож зірки чесні
  // для всіх типів активностей; 0 зірок все одно означає «пройдено».
  $('path-done-stars').textContent = progress.bestStars
    ? '⭐'.repeat(progress.bestStars) + '☆'.repeat(3 - progress.bestStars)
    : ''

  // Praise line varies by stars; celebratory bounce on the completion screen.
  const praise = progress.bestStars >= 3 ? 'Супер! Аж три зірки! 🌟'
    : progress.bestStars === 2 ? 'Чудова робота! 💪'
    : progress.bestStars === 1 ? 'Молодець! Уперед до нових пригод!'
    : 'Точку пройдено! Так тримати!'
  renderMascot(doneMascot, { message: praise, side: 'right', celebrate: true })

  // Aggregate practice evidence across the point's activities.
  const graded = results.filter(r => r.total > 0)
  const totalItems = graded.reduce((sum, r) => sum + r.total, 0)
  const correctItems = graded.reduce((sum, r) => sum + r.correct, 0)
  const accuracy = totalItems ? Math.round((correctItems / totalItems) * 100) : null
  doneStats.innerHTML = ''
  const tiles: Array<{ value: string; label: string }> = []
  if (totalItems) tiles.push({ value: String(totalItems), label: 'Завдань' })
  if (accuracy !== null) tiles.push({ value: `${accuracy}%`, label: 'Влучність' })
  for (const t of tiles) {
    const tile = document.createElement('div')
    tile.className = 'finish-stat'
    const value = document.createElement('span')
    value.className = 'finish-stat__value'
    value.textContent = t.value
    const label = document.createElement('span')
    label.className = 'finish-stat__label'
    label.textContent = t.label
    tile.append(value, label)
    doneStats.append(tile)
  }

  // «Суперсили» — унікальні теми, які тренує ця точка (дитячі підписи).
  const topics = [...new Set(p.curriculum.map(c => c.topic))]
  doneSkills.innerHTML = ''
  if (topics.length) {
    const title = document.createElement('p')
    title.className = 'finish-skills__title'
    title.textContent = topics.length > 1 ? 'Прокачані суперсили:' : 'Прокачана суперсила:'
    const chips = document.createElement('div')
    chips.className = 'finish-skills__chips'
    for (const topic of topics) {
      const chip = document.createElement('span')
      chip.className = 'finish-skill'
      chip.textContent = `⚡ ${TOPIC_SHORT[topic] ?? topic}`
      chips.append(chip)
    }
    doneSkills.append(title, chips)
  }
  const unlockedNow = map.points.filter(x =>
    !store.isCompleted(x.id) && x.unlockAfter.includes(p.id) && isUnlocked(x, new Set(store.completedIds())),
  )
  // Anonymous runs keep further points locked until the path is saved
  // (anonymousGate in renderMap), so only signed-in kids see the unlock list.
  $('path-done-message').textContent = activeChildProfileId && unlockedNow.length
    ? `Точку пройдено! Відкрилось: ${unlockedNow.map(x => `${x.icon} ${x.title}`).join(', ')}`
    : 'Точку пройдено! Молодець!'
  // Anonymous run: the save-path CTA lives right on this screen, so the child
  // doesn't have to go back to the map to discover it.
  doneSave.classList.toggle('hidden', Boolean(activeChildProfileId))
  show(doneEl)
  $('path-done-map-btn').focus()
}

function clearActivityRoots() {
  lessonRoot.innerHTML = ''
  bonusRoot.innerHTML = ''
  sortingRoot.innerHTML = ''
  puzzlesRoot.innerHTML = ''
  foRoot.innerHTML = ''
  els.options.innerHTML = ''
  els.questionText.textContent = ''
  els.feedback.textContent = ''
  els.explanation.textContent = ''
  els.progressBar.style.width = '0%'
}

function revealParentGateIfVisible(): boolean {
  if (parentGate.classList.contains('hidden')) return false
  parentGate.focus({ preventScroll: true })
  const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  requestAnimationFrame(() => parentGate.scrollIntoView({ behavior, block: 'center' }))
  return true
}

function backToMap() {
  activeRun += 1
  setActivityMode(false)
  hide(activityEl)
  hide(doneEl)
  clearActivityRoots()
  if (pendingMap) {
    map = pendingMap
    pendingMap = null
    $('path-subtitle').textContent = `${map.title} · проходь точки — відкривай нові!`
  }
  renderMap()
  show(mapScreen)
  if (!revealParentGateIfVisible()) $('main-content').focus()
}

$('path-back-btn').addEventListener('click', backToMap)
$('path-done-map-btn').addEventListener('click', backToMap)

if (requestedMap && !isYearlyPreview) {
  renderMap()
  schedulePathSync()
  // Свіжа карта з бандла (правки з адмінки без релізу коду). Оновлюємо лише
  // на екрані карти: підміна структури посеред активної точки могла б
  // розсинхронізувати кроки поточного проходження.
  void loadGradeMap(map.grade, requestedMap).then(fresh => {
    if (!fresh || fresh === requestedMap) return
    if (!activityEl.classList.contains('hidden')) {
      pendingMap = fresh
      return
    }
    map = fresh
    $('path-subtitle').textContent = `${map.title} · проходь точки — відкривай нові!`
    renderMap()
  })
}
