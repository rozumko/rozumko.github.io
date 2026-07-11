import './frontend-security.js'
import { $, $maybe } from './utils/dom.js'
import { mountSortingGame } from './features/games/sorting-game.js'
import { SORTING_ATTRIBUTES_LEVELS, INFO_SORT_LEVELS, MULTISORT_LEVELS, type SortingLevel } from './features/games/sorting-data.js'
import { mountPuzzles } from './features/games/puzzle-engine.js'
import { mountFactOpinion } from './features/games/fact-opinion-game.js'
import { FO_LEVEL1_STATEMENTS, FO_LEVEL2_STATEMENTS } from './features/games/fact-opinion-data.js'
import { mountSimulator } from './features/games/simulator-engine.js'
import { HARDWARE_SCENARIO, SOFTWARE_SCENARIO } from './features/games/simulator-data.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import { loadStaticQuestions } from './features/missions/static-questions.js'
import {
  PATHS_BY_GRADE, isUnlocked,
  type PathPoint, type PathActivity, type PathActivityStep,
} from './features/path/path-data.js'
import { createProgressStore } from './features/path/progress-store.js'
import { syncPathProgress } from './features/path/path-sync.js'
import {
  getParentPathProgress, getParentSession, submitParentPathProgress,
} from './features/api/client.js'
import {
  fromSortingSummary, fromPuzzleSummary, fromMissionSummary, fromGameSummary,
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

const savedGrade = getSavedGrade()
const queryGradeRaw = new URLSearchParams(window.location.search).get('grade')
const queryGrade = queryGradeRaw !== null ? Number(queryGradeRaw) : null
const requestedGrade = queryGrade !== null && Number.isInteger(queryGrade) && queryGrade > 0
  ? queryGrade
  : savedGrade
const requestedMap = PATHS_BY_GRADE[requestedGrade]
const map = requestedMap ?? PATHS_BY_GRADE[savedGrade]!
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
const sortingRoot  = $('path-sorting-root')
const puzzlesRoot  = $('path-puzzles-root')
const foRoot       = $('path-fo-root')
const missionQuiz  = $('mission-quiz')
const doneEl       = $('path-done')
const parentGate   = $('path-parent-gate')
const parentGateLink = $<HTMLAnchorElement>('path-parent-gate-link')

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

if (!requestedMap) {
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

function renderMap() {
  const completed = new Set(store.completedIds())
  const mapPointIds = new Set(map.points.map(p => p.id))
  const completedInMap = [...completed].filter(id => mapPointIds.has(id))
  const anonymousGate = !activeChildProfileId && completedInMap.length > 0
  parentGate.classList.toggle('hidden', !anonymousGate)

  // Ребра: від кожної передумови до точки. Координати = відсотки viewBox 100×100.
  edgesSvg.innerHTML = map.points.flatMap(p =>
    p.unlockAfter.map(depId => {
      const from = map.points.find(x => x.id === depId)
      if (!from) return ''
      const open = completed.has(depId)
      const midY = (from.y + p.y) / 2
      return `<path d="M ${from.x} ${from.y} C ${from.x} ${midY}, ${p.x} ${midY}, ${p.x} ${p.y}"
        class="path-edge ${open ? 'path-edge--open' : ''}" />`
    }),
  ).join('')

  nodesBox.innerHTML = ''
  for (const p of map.points) {
    const done = completed.has(p.id)
    const open = !anonymousGate && isUnlocked(p, completed)
    const stars = store.getPoint(p.id)?.bestStars ?? 0

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `path-node ${trackClass(p)} ${done ? 'path-node--done' : open ? 'path-node--open' : 'path-node--locked'}`
    btn.style.left = `${p.x}%`
    btn.style.top = `${p.y}%`
    btn.disabled = !open && !done
    const state = done
      ? `виконано${stars ? `, ${stars} з 3 зірок` : ''}`
      : open ? 'доступно' : 'ще зачинено'
    btn.setAttribute('aria-label', `${p.title} — ${state}`)
    btn.innerHTML = `
      <span class="path-node__badge" aria-hidden="true">${done ? '✓' : open ? p.icon : '🔒'}</span>
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

function activityContext(p: PathPoint, step: PathActivityStep): ActivityContext {
  return {
    activityId: `path:${p.id}:${step.id}`,
    activityVersion: step.version,
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

  try {
    await startActivityStep(p, requiredSteps, 0, [], run)
  } catch (err) {
    if (run !== activeRun) return
    backToMap()
    errorEl.textContent = (err as Error).message
  }
}

async function startActivityStep(
  p: PathPoint,
  steps: PathActivityStep[],
  index: number,
  results: ActivityResult[],
  run: number,
) {
  if (run !== activeRun) return
  if (index >= steps.length) {
    finishPoint(p, results, run)
    return
  }

  const step = steps[index]
  const a: PathActivity = step.activity
  clearActivityRoots()
  hide(sortingRoot); hide(puzzlesRoot); hide(foRoot); hide(missionQuiz)
  activityBar.textContent = steps.length > 1
    ? `${p.icon} ${p.title} · ${index + 1}/${steps.length}: ${step.title}`
    : `${p.icon} ${p.title}`

  const complete = (result: ActivityResult) => {
    if (run !== activeRun) return
    void startActivityStep(p, steps, index + 1, [...results, result], run)
  }

  if (a.kind === 'sorting') {
    show(sortingRoot)
    mountSortingGame(sortingRoot, SORTING_GAMES[a.game], {
      onComplete: s => complete(fromSortingSummary(s, activityContext(p, step))),
    })
  } else if (a.kind === 'puzzles') {
    show(puzzlesRoot)
    mountPuzzles(puzzlesRoot, map.grade, a.count ?? 5, {
      onComplete: s => complete(fromPuzzleSummary(s, activityContext(p, step))),
    })
  } else if (a.kind === 'fact-opinion') {
    show(foRoot)
    mountFactOpinion(foRoot, a.level === 1 ? FO_LEVEL1_STATEMENTS : FO_LEVEL2_STATEMENTS, {
      onComplete: s => complete(fromGameSummary(s, activityContext(p, step))),
    })
  } else if (a.kind === 'simulator') {
    show(foRoot)
    mountSimulator(foRoot, a.scenario === 'hardware' ? HARDWARE_SCENARIO : SOFTWARE_SCENARIO, {
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
    runMission(els, questions, {
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
  const progress = store.recordResults(p.id, results)
  schedulePathSync()
  hide(activityEl)
  clearActivityRoots()

  $('path-done-title').textContent = p.title
  // Місії home-карти показують локальний фідбек (practice), тож зірки чесні
  // для всіх типів активностей; 0 зірок все одно означає «пройдено».
  $('path-done-stars').textContent = progress.bestStars
    ? '⭐'.repeat(progress.bestStars) + '☆'.repeat(3 - progress.bestStars)
    : ''
  const unlockedNow = map.points.filter(x =>
    !store.isCompleted(x.id) && x.unlockAfter.includes(p.id) && isUnlocked(x, new Set(store.completedIds())),
  )
  $('path-done-message').textContent = !activeChildProfileId
    ? 'Точку пройдено! Поклич дорослого, щоб зберегти шлях і відкрити наступні пригоди.'
    : unlockedNow.length
    ? `Точку пройдено! Відкрилось: ${unlockedNow.map(x => `${x.icon} ${x.title}`).join(', ')}`
    : 'Точку пройдено! Молодець!'
  show(doneEl)
  $('path-done-map-btn').focus()
}

function clearActivityRoots() {
  sortingRoot.innerHTML = ''
  puzzlesRoot.innerHTML = ''
  foRoot.innerHTML = ''
  els.options.innerHTML = ''
  els.questionText.textContent = ''
  els.feedback.textContent = ''
  els.explanation.textContent = ''
  els.progressBar.style.width = '0%'
}

function backToMap() {
  activeRun += 1
  setActivityMode(false)
  hide(activityEl)
  hide(doneEl)
  clearActivityRoots()
  renderMap()
  show(mapScreen)
  $('main-content').focus()
}

$('path-back-btn').addEventListener('click', backToMap)
$('path-done-map-btn').addEventListener('click', backToMap)

if (requestedMap) {
  renderMap()
  schedulePathSync()
}
