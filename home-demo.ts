import { $, $maybe } from './utils/dom.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import {
  createHomeLead, loadQuestions, submitHomeDemoReport, getHomeClub, submitHomeMissionReport,
  loadHomeClubQuestions,
  type Question, type HomeDemoTrack, type HomeDemoEvent, type HomeDemoReport, type HomeClubState,
} from './features/api/client.js'

// Home Demo (зріз 2 контракту docs/home-demo-contract.md).
// Дитина проходить демо-місію без облікового запису: питання приходять із
// публічного backend API без ключів відповідей. Сирі відповіді + телеметрія
// збираються В ПАМʼЯТІ і йдуть на бекенд лише після згоди батька — там сервер
// перераховує все сам і повертає звіт. До згоди — жодного запису.

const POLICY_VERSION = 'privacy-2026-07'
const MISSION_VERSION = 1
const DEMO_COUNT = 6

interface TrackPreset {
  track: HomeDemoTrack
  label: string
  difficulty: 'easy' | 'medium' | 'hard'
}

const TRACKS: Record<string, TrackPreset> = {
  'informatics': {
    track: 'informatics',
    label: 'Інформатика',
    difficulty: 'easy',
  },
  'computational-thinking': {
    track: 'computational-thinking',
    label: 'Обчислювальне мислення',
    difficulty: 'medium',
  },
  'ai-basics': {
    track: 'ai-basics',
    label: 'Основи ШІ',
    difficulty: 'hard',
  },
}

// ── DOM ───────────────────────────────────────────────────────
const introEl  = $('demo-intro')
const quizEl   = $('mission-quiz')
const resultEl = $('mission-result')
const errorEl  = $('demo-error')

const els: MissionElements = {
  progressText: $('quiz-progress-text'),
  progressBar:  $('quiz-progress-bar'),
  questionText: $('quiz-question-text'),
  codeBlock:    $maybe('quiz-code-block'),
  options:      $('quiz-options'),
  feedback:     $('quiz-feedback'),
  explanation:  $('quiz-explanation'),
  nextBtn:      $<HTMLButtonElement>('quiz-next-btn'),
}

function show(el: HTMLElement) { el.classList.remove('hidden') }
function hide(el: HTMLElement) { el.classList.add('hidden') }
function setMissionActive(active: boolean) {
  document.documentElement.classList.toggle('mission-active', active)
  document.body.classList.toggle('mission-active', active)
}

// ── Стан демо-спроби (лише памʼять — до згоди нічого не зберігається) ────────
let selectedGrade = 1
let currentTrack: TrackPreset | null = null
let events: HomeDemoEvent[] = []
let startedAtIso = ''
// Лід зʼявляється після згоди батька і живе лише в памʼяті сторінки (MVP).
let lead: { id: string; token: string } | null = null
// 'demo' — звіт залочений до згоди; 'club' — платна практика, звіт одразу.
let missionMode: 'demo' | 'club' = 'demo'
let questionShownAt = 0
let selectTouches = 0 // повторні зміни select-ів (match) — сигнал невпевненості

type RawAnswer = number | string | number[]

const KEY_FIELDS = ['correct', 'explanation', 'correctOrder', 'pairs', 'answer'] as const

function stripKeys(q: Question): Question {
  const copy: Record<string, unknown> = { ...q }
  for (const f of KEY_FIELDS) delete copy[f]
  if (copy.options && typeof copy.options === 'object' && !Array.isArray(copy.options)) {
    const opts: Record<string, unknown> = { ...(copy.options as Record<string, unknown>) }
    for (const f of KEY_FIELDS) delete opts[f]
    copy.options = opts as Question['options']
  }
  return copy as Question
}

async function loadDemoQuestions(preset: TrackPreset): Promise<Question[]> {
  const byTrack = await loadQuestions({
    grade: selectedGrade,
    isOlympiad: false,
    count: DEMO_COUNT,
    track: preset.track,
    hideAnswers: true,
  })
  if (byTrack.length >= Math.min(DEMO_COUNT, 3)) return byTrack.slice(0, DEMO_COUNT).map(stripKeys)

  // Тимчасовий fallback для наявної БД до розмітки старих питань `track`.
  const fallback = await loadQuestions({
    grade: selectedGrade,
    isOlympiad: false,
    count: DEMO_COUNT,
    difficulty: preset.difficulty,
    hideAnswers: true,
  })
  return fallback.map(stripKeys)
}

async function loadClubQuestions(preset: TrackPreset): Promise<Question[]> {
  if (!lead) throw new Error('Потрібно спершу розблокувати батьківський звіт')
  const byTrack = await loadHomeClubQuestions(lead.id, lead.token, {
    grade: selectedGrade,
    count: DEMO_COUNT,
    track: preset.track,
  })
  if (byTrack.length >= Math.min(DEMO_COUNT, 3)) return byTrack.slice(0, DEMO_COUNT).map(stripKeys)

  const fallback = await loadHomeClubQuestions(lead.id, lead.token, {
    grade: selectedGrade,
    count: DEMO_COUNT,
    track: preset.track,
    difficulty: preset.difficulty,
  })
  return fallback.map(stripKeys)
}

// ── Телеметрія ────────────────────────────────────────────────
// Контракт вимагає timeToAnswerMs і answerChangeCount у кожній події з першого
// релізу. Поточний renderer блокує choice-типи після першого кліку, тож
// answerChangeCount свідомо НЕДОоцінює (рахує лише повторні зміни select-ів у
// match) — безпечний напрям: патерн "невпевненість" не спрацює хибно.
els.options.addEventListener('change', (e) => {
  const t = e.target as HTMLElement
  if (t instanceof HTMLSelectElement) {
    if (t.dataset['touched']) selectTouches++
    else t.dataset['touched'] = '1'
  }
})
els.nextBtn.addEventListener('click', () => {
  questionShownAt = Date.now()
  selectTouches = 0
})

function recordEvent(questionId: string, answer: RawAnswer) {
  events.push({
    questionId,
    answer,
    timeToAnswerMs:    Math.min(Math.max(Date.now() - questionShownAt, 0), 3_600_000),
    answerChangeCount: Math.min(selectTouches, 100),
    position:          events.length,
  })
}

// ── Запуск місії (демо або Club practice) ─────────────────────
async function startDemo(preset: TrackPreset, mode: 'demo' | 'club' = 'demo') {
  hide(introEl)
  hide(resultEl)
  errorEl.textContent = ''
  currentTrack = preset
  missionMode = mode
  events = []
  startedAtIso = new Date().toISOString()

  show(quizEl)
  setMissionActive(true)
  els.questionText.textContent = 'Готуємо місію…'
  els.options.innerHTML = ''
  els.nextBtn.classList.add('hidden')

  try {
    const questions = mode === 'club'
      ? await loadClubQuestions(preset)
      : await loadDemoQuestions(preset)

    questionShownAt = Date.now()
    selectTouches = 0

    runMission(els, questions, {
      showExplanation: false,
      // Ключів у браузері немає → renderer віддає сиру відповідь. Дитині
      // показуємо нейтральний прогрес, а correctness рахує серверний звіт.
      submitAnswer: (questionId, answer) => {
        recordEvent(questionId, answer)
        return Promise.resolve(null)
      },
      onComplete: showCompletion,
    })
  } catch (err) {
    setMissionActive(false)
    hide(quizEl)
    show(introEl)
    errorEl.textContent = (err as Error).message
  }
}

// ── Емоційне завершення + parent gate ─────────────────────────
function showCompletion() {
  setMissionActive(false)
  hide(quizEl)
  els.progressBar.style.width = '100%'

  $('result-track-label').textContent = currentTrack ? `${currentTrack.label} • ${selectedGrade} клас` : 'Місію завершено!'
  $('result-stars').textContent = '🏆'

  if (missionMode === 'club' && lead) {
    // Club: згода вже є — звіт формується одразу, без повторного gate.
    $('result-message').textContent = 'Місію завершено!'
    hide($('parent-gate'))
    show(resultEl)
    void submitClubReport()
    return
  }

  $('result-message').textContent = 'Місію завершено! Розгорнутий результат чекає у звіті для батьків.'
  // Свідомо без цифр для дитини: рахунок і аналіз — у батьківському звіті.
  hide($('demo-report'))
  hide($('club-block'))
  show($('parent-gate'))
  show(resultEl)
}

async function submitClubReport() {
  if (!lead || !currentTrack) return
  const status = $('club-status')
  status.textContent = 'Готуємо звіт…'
  show($('club-block'))
  try {
    const { report } = await submitHomeMissionReport(lead.id, lead.token, {
      missionId:      `practice-${currentTrack.track}-grade${selectedGrade}`,
      missionVersion: MISSION_VERSION,
      track:          currentTrack.track,
      grade:          selectedGrade as 1 | 2 | 3 | 4,
      startedAt:      startedAtIso,
      finishedAt:     new Date().toISOString(),
      events,
    })
    renderReport(report)
    show($('demo-report'))
  } catch (err) {
    status.textContent = (err as Error).message
  }
  void refreshClubBlock()
}

// ── Rozumko Club: стан доступу і запуск платної практики ──────
async function refreshClubBlock() {
  if (!lead) return
  const block = $('club-block')
  const status = $('club-status')
  const tracksBox = $('club-tracks')
  tracksBox.innerHTML = ''

  let club: HomeClubState
  try {
    club = await getHomeClub(lead.id, lead.token)
  } catch {
    hide(block)
    return
  }

  if (club.hasAccess) {
    const until = club.currentPeriodEnd
      ? ` до ${new Date(club.currentPeriodEnd).toLocaleDateString('uk-UA')}`
      : ''
    status.textContent = `Доступ активний${until}. Обери напрям нової місії:`
    for (const key of club.tracks) {
      const preset = TRACKS[key]
      if (!preset) continue
      const btn = document.createElement('button')
      btn.className = 'btn'
      btn.textContent = preset.label
      btn.addEventListener('click', () => { void startDemo(preset, 'club') })
      tracksBox.appendChild(btn)
    }
  } else {
    status.textContent = club.status === 'none'
      ? 'Повний доступ до регулярної практики відкриється з підпискою Rozumko Club. Ми напишемо на вказаний email, щойно оформлення стане доступним.'
      : 'Доступ до Rozumko Club зараз неактивний. Якщо це виглядає як помилка — напишіть нам.'
  }
  show(block)
}

// ── Parent gate: згода → лід → серверний звіт ─────────────────
async function unlockReport() {
  const email = $<HTMLInputElement>('parent-email').value.trim()
  const consented = $<HTMLInputElement>('parent-consent').checked
  const displayName = $<HTMLInputElement>('child-name').value.trim()
  const gateError = $('gate-error')
  gateError.textContent = ''

  if (!email) { gateError.textContent = 'Вкажіть email'; return }
  if (!consented) { gateError.textContent = 'Потрібна згода на обробку даних'; return }
  if (!currentTrack || events.length === 0) { gateError.textContent = 'Демо-місію ще не пройдено'; return }

  const btn = $<HTMLButtonElement>('gate-submit-btn')
  btn.disabled = true
  btn.textContent = 'Готуємо звіт…'

  try {
    const created = await createHomeLead(
      email,
      { policyVersion: POLICY_VERSION, acceptedAt: new Date().toISOString() },
      { grade: selectedGrade as 1 | 2 | 3 | 4, ...(displayName ? { displayName } : {}) },
    )
    lead = { id: created.leadId, token: created.leadToken }
    const { report } = await submitHomeDemoReport(lead.id, lead.token, {
      missionId:      `demo-${currentTrack.track}-grade${selectedGrade}`,
      missionVersion: MISSION_VERSION,
      track:          currentTrack.track,
      grade:          selectedGrade as 1 | 2 | 3 | 4,
      startedAt:      startedAtIso,
      finishedAt:     new Date().toISOString(),
      events,
    })
    renderReport(report)
    hide($('parent-gate'))
    show($('demo-report'))
    void refreshClubBlock()
  } catch (err) {
    gateError.textContent = (err as Error).message
  } finally {
    btn.disabled = false
    btn.textContent = 'Отримати звіт'
  }
}

function renderReport(report: HomeDemoReport) {
  const box = $('demo-report-body')
  box.innerHTML = ''

  const add = (parent: HTMLElement, tag: string, text: string, style?: string) => {
    const el = document.createElement(tag)
    el.textContent = text
    if (style) el.setAttribute('style', style)
    parent.appendChild(el)
    return el
  }

  add(box, 'p', `Виконано: ${report.correct} з ${report.total} завдань.`, 'font-weight:700;')

  if (report.strengths.length) {
    add(box, 'p', 'Що виходить добре:', 'font-weight:700; margin-top:12px;')
    const ul = document.createElement('ul')
    ul.className = 'doc-list'
    report.strengths.forEach(s => add(ul, 'li', s))
    box.appendChild(ul)
  }
  if (report.struggles.length) {
    add(box, 'p', 'Зона росту:', 'font-weight:700; margin-top:12px;')
    const ul = document.createElement('ul')
    ul.className = 'doc-list'
    report.struggles.forEach(s => add(ul, 'li', s))
    box.appendChild(ul)
  }
  if (report.patterns.length) {
    add(box, 'p', 'Що ми помітили:', 'font-weight:700; margin-top:12px;')
    const ul = document.createElement('ul')
    ul.className = 'doc-list'
    report.patterns.forEach(p => add(ul, 'li', p.evidence))
    box.appendChild(ul)
  }
  add(box, 'p', `Наступний крок: ${report.nextMission.reason}`, 'margin-top:12px;')
}

// ── Інтро: вибір класу і напряму ──────────────────────────────
function highlightGrade(grade: number) {
  document.querySelectorAll<HTMLElement>('.home-grade-btn').forEach(btn => {
    const active = Number(btn.dataset['grade']) === grade
    btn.setAttribute('aria-pressed', String(active))
    btn.style.outline = active ? '3px solid #3b82f6' : ''
    btn.style.outlineOffset = active ? '2px' : ''
  })
}

document.querySelectorAll<HTMLElement>('.home-grade-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const grade = Number(btn.dataset['grade'])
    if (grade >= 1 && grade <= 4) {
      selectedGrade = grade
      highlightGrade(grade)
    }
  })
})

document.querySelectorAll<HTMLElement>('.home-track-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = TRACKS[btn.dataset['track'] ?? '']
    if (preset) startDemo(preset)
  })
})

$maybe('demo-retry-btn')?.addEventListener('click', () => {
  hide(resultEl)
  errorEl.textContent = ''
  show(introEl)
})

$maybe<HTMLButtonElement>('gate-submit-btn')?.addEventListener('click', unlockReport)
// Доступ можуть видати після розблокування звіту (зараз — вручну адміном):
// кнопка дає перезапитати стан без перепроходження демо.
$maybe<HTMLButtonElement>('club-refresh-btn')?.addEventListener('click', () => { void refreshClubBlock() })

highlightGrade(selectedGrade)
