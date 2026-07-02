import { $, $maybe } from './utils/dom.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import {
  createHomeLead, loadQuestions, submitHomeDemoReport,
  type Question, type HomeDemoTrack, type HomeDemoEvent, type HomeDemoReport,
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
  keywords: string[]
}

const TRACKS: Record<string, TrackPreset> = {
  'informatics': {
    track: 'informatics',
    label: 'Інформатика',
    difficulty: 'easy',
    keywords: ['комп', 'ноут', 'клавіат', 'миша', 'файл', 'екран', 'програма', 'код'],
  },
  'computational-thinking': {
    track: 'computational-thinking',
    label: 'Обчислювальне мислення',
    difficulty: 'medium',
    keywords: ['алгоритм', 'патерн', 'закономір', 'послідов', 'умова', 'команд', 'робот', 'маршрут'],
  },
  'ai-basics': {
    track: 'ai-basics',
    label: 'Основи ШІ',
    difficulty: 'hard',
    keywords: ['штуч', 'інтелект', 'дан', 'модель', 'приклад', 'ознака', 'розпізна', 'класиф'],
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

function scoreTrack(q: Question, preset: TrackPreset): number {
  const haystack = [q.q, q.code, ...(Array.isArray(q.options) ? q.options : [])]
    .filter(Boolean).join(' ').toLowerCase()
  return preset.keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0)
}

async function loadDemoQuestions(preset: TrackPreset): Promise<Question[]> {
  const pool = await loadQuestions({
    grade: selectedGrade,
    isOlympiad: false,
    count: 50,
    difficulty: preset.difficulty,
    hideAnswers: true,
  })
  const ranked = [...pool].sort((a, b) => scoreTrack(b, preset) - scoreTrack(a, preset))
  return ranked.slice(0, DEMO_COUNT).map(stripKeys)
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

// ── Запуск демо-місії ─────────────────────────────────────────
async function startDemo(preset: TrackPreset) {
  hide(introEl)
  hide(resultEl)
  errorEl.textContent = ''
  currentTrack = preset
  events = []
  startedAtIso = new Date().toISOString()

  show(quizEl)
  setMissionActive(true)
  els.questionText.textContent = 'Готуємо місію…'
  els.options.innerHTML = ''
  els.nextBtn.classList.add('hidden')

  try {
    const questions = await loadDemoQuestions(preset)

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
  $('result-message').textContent = 'Місію завершено! Розгорнутий результат чекає у звіті для батьків.'

  // Свідомо без цифр для дитини: рахунок і аналіз — у батьківському звіті.
  hide($('demo-report'))
  show($('parent-gate'))
  show(resultEl)
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
    const lead = await createHomeLead(
      email,
      { policyVersion: POLICY_VERSION, acceptedAt: new Date().toISOString() },
      { grade: selectedGrade as 1 | 2 | 3 | 4, ...(displayName ? { displayName } : {}) },
    )
    const { report } = await submitHomeDemoReport(lead.leadId, lead.leadToken, {
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

highlightGrade(selectedGrade)
