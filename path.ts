import './frontend-security.js'
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
const queryGradeRaw = new URLSearchParams(window.location.search).get('grade')
const queryGrade = queryGradeRaw !== null ? Number(queryGradeRaw) : null
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
  $('path-done-message').textContent = !activeChildProfileId
    ? 'Точку пройдено! Поклич дорослого, щоб зберегти шлях і відкрити наступні пригоди.'
    : unlockedNow.length
    ? `Точку пройдено! Відкрилось: ${unlockedNow.map(x => `${x.icon} ${x.title}`).join(', ')}`
    : 'Точку пройдено! Молодець!'
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

if (requestedMap) {
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
