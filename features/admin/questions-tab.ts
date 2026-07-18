import {
  getAdminQuestions, createQuestion, updateQuestion, deleteQuestion,
  setQuestionEditorialStatus, getQuestionRevisions, restoreQuestionRevision,
  type Question, type QuestionChannel, type QuestionType,
} from '../../features/api/client.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { renderQuestion }  from '../../utils/question-renderer.js'
import { esc, showModal, showConfirm }  from './ui.js'
import { $, $maybe } from '../../utils/dom.js'
import { TOPIC_LABELS, fillTopicSelect } from './taxonomy.js'
import { refreshContentDeliveryBanner } from './publication-tab.js'

let currentQuestions: Question[] = []

const questionModal = $<HTMLElement>('question-modal')
const questionForm  = $<HTMLFormElement>('question-form')
const qfError       = $('qf-error')
const qfSubmitBtn   = $<HTMLButtonElement>('qf-submit')
const previewModal  = $<HTMLElement>('preview-modal')

let _qModalTrapRemove: (() => void) | null = null
let _pvTrapRemove:     (() => void) | null = null

const QF_SECTIONS: Record<string, string> = {
  choice:    'qf-section-choice',
  sort:      'qf-section-sort',
  sequence:  'qf-section-sequence',
  match:     'qf-section-match',
  truefalse: 'qf-section-truefalse',
  input:     'qf-section-input',
}

const DIFF_LABELS: Record<string, string> = { easy: 'Легке', medium: 'Середнє', hard: 'Складне' }
const TRACK_LABELS: Record<string, string> = {
  informatics: 'Інформатика',
  'computational-thinking': 'Обчислювальне мислення',
  'ai-basics': 'Основи ШІ',
}
const TYPE_LABELS: Record<QuestionType, string> = {
  choice:    'Вибір',
  truefalse: 'Так/Ні',
  input:     'Введення',
  sort:      'Порядок',
  sequence:  'Послідовність',
  match:     'Пари',
}
const CHANNEL_LABELS: Record<QuestionChannel, string> = {
  class_game: 'Школа — класна гра',
  path: 'Home Club',
  olympiad_training: 'Відкрита практика, демо та Шлях',
}
const CHANNEL_INPUTS: Record<QuestionChannel, string> = {
  class_game: 'qf-channel-class-game',
  path: 'qf-channel-path',
  olympiad_training: 'qf-channel-olympiad-training',
}
const STATUS_LABELS: Record<NonNullable<Question['editorialStatus']>, string> = {
  draft: 'Чернетка', review: 'Готове до публікації', published: 'Опубліковано', archived: 'Знято з публікації',
}
const STATUS_BADGES: Record<NonNullable<Question['editorialStatus']>, string> = {
  draft: 'qi-badge--medium', review: 'qi-badge--type', published: 'qi-badge--easy', archived: 'qi-badge--type',
}

function selectedChannels(): QuestionChannel[] {
  return (Object.entries(CHANNEL_INPUTS) as [QuestionChannel, string][])
    .filter(([, inputId]) => $<HTMLInputElement>(inputId).checked)
    .map(([channel]) => channel)
}

function syncDistributionUI(): void {
  const isMainRound = $<HTMLInputElement>('qf-olympiad').checked
  for (const inputId of Object.values(CHANNEL_INPUTS)) {
    const input = $<HTMLInputElement>(inputId)
    if (isMainRound) input.checked = false
    input.disabled = isMainRound
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initQuestionsTab() {
  $<HTMLButtonElement>('add-question-btn').addEventListener('click', () => openQuestionModal(null))
  $<HTMLButtonElement>('qf-cancel').addEventListener('click', closeQuestionModal)
  $<HTMLButtonElement>('preview-close').addEventListener('click', closePreview)
  previewModal.addEventListener('click', (e) => { if (e.target === previewModal) closePreview() })
  $<HTMLSelectElement>('qf-type').addEventListener('change', (e) => {
    applyTypeUI((e.target as HTMLSelectElement).value)
  })
  $<HTMLButtonElement>('q-filter-apply').addEventListener('click', () => loadQuestionsTab())
  $<HTMLInputElement>('q-filter-search').addEventListener('keydown', event => {
    if (event.key === 'Enter') void loadQuestionsTab()
  })
  // Тема залежить від напряму — і у фільтрі, і у формі
  $<HTMLSelectElement>('q-filter-track').addEventListener('change', (e) => {
    fillTopicSelect($<HTMLSelectElement>('q-filter-topic'), (e.target as HTMLSelectElement).value, 'Всі теми')
  })
  $<HTMLSelectElement>('qf-track').addEventListener('change', (e) => {
    fillTopicSelect($<HTMLSelectElement>('qf-topic'), (e.target as HTMLSelectElement).value, 'Без теми')
  })
  $<HTMLInputElement>('qf-olympiad').addEventListener('change', syncDistributionUI)
  for (const inputId of Object.values(CHANNEL_INPUTS)) {
    $<HTMLInputElement>(inputId).addEventListener('change', event => {
      if ((event.target as HTMLInputElement).checked) $<HTMLInputElement>('qf-olympiad').checked = false
      syncDistributionUI()
    })
  }
  $<HTMLInputElement>('qf-img').addEventListener('input', (e) => {
    const prev = $maybe<HTMLImageElement>('qf-img-preview')
    const url  = (e.target as HTMLInputElement).value.trim()
    if (url && prev) { prev.src = url; prev.classList.remove('hidden') }
    else if (prev)   { prev.classList.add('hidden'); prev.src = '' }
  })
  questionForm.addEventListener('submit', handleSubmit)
  $<HTMLButtonElement>('qf-preview').addEventListener('click', handlePreviewClick)
}

// ─── List ──────────────────────────────────────────────────────────────────────

export async function loadQuestionsTab() {
  const list = $('questions-list')
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'
  try {
    const grade      = $<HTMLSelectElement>('q-filter-grade').value || undefined
    const section    = $<HTMLSelectElement>('q-filter-section').value
    const isMainRound = section === 'main_round'
    const isOlympiad = section ? isMainRound : undefined
    const type       = $<HTMLSelectElement>('q-filter-mechanic').value || undefined
    const channel    = section && !isMainRound ? section as QuestionChannel : undefined
    const difficulty = $<HTMLSelectElement>('q-filter-difficulty').value || undefined
    const track      = $<HTMLSelectElement>('q-filter-track').value || undefined
    const topic      = $<HTMLSelectElement>('q-filter-topic').value || undefined
    const status     = $<HTMLSelectElement>('q-filter-status').value || undefined
    const search     = $<HTMLInputElement>('q-filter-search').value.trim() || undefined

    const { questions } = await getAdminQuestions({ grade, isOlympiad, type, channel, difficulty, track, topic, status, search })
    currentQuestions = questions

    $('q-count').textContent = `${questions.length} питань`

    if (!questions.length) {
      list.innerHTML = `
        <div class="admin-empty-state"><div>
          <i class="fas fa-question-circle admin-empty-state__icon"></i>
          <p class="admin-empty-state__title">Питань не знайдено</p>
        </div></div>`
      return
    }

    list.innerHTML = ''
    questions.forEach(q => list.appendChild(buildQuestionCard(q)))
  } catch (err) {
    list.innerHTML = ''
    const error = document.createElement('p')
    error.className = 'admin-list-error'
    error.textContent = (err as Error).message
    list.appendChild(error)
  }
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function buildQuestionCard(q: Question): HTMLElement {
  const diffLabel  = DIFF_LABELS[q.difficulty ?? ''] ?? q.difficulty ?? '—'
  const trackLabel = q.track ? (TRACK_LABELS[q.track] ?? q.track) : null
  const type = q.type ?? 'choice'
  const correctHint = describeCorrectAnswer(q)
  const status = q.editorialStatus ?? 'published'
  const immutable = Boolean(q.publishedAt) || status === 'published'
  const nextStatus = status === 'draft' || status === 'review' ? 'published' : status === 'published' ? 'archived' : immutable ? 'published' : 'draft'
  const nextLabel = status === 'draft' || status === 'review' ? 'Опублікувати' : status === 'published' ? 'Зняти з публікації' : immutable ? 'Опублікувати знову' : 'Повернути в чернетки'
  const el = document.createElement('div')
  el.className = 'question-item'
  el.innerHTML = `
    <div class="question-item__left">
      <div class="question-item__badges">
        <span class="qi-badge ${STATUS_BADGES[status]}">${STATUS_LABELS[status]}</span>
        <span class="qi-badge qi-badge--grade">${esc(String(q.grade))} клас</span>
        <span class="qi-badge qi-badge--type">${esc(TYPE_LABELS[type] ?? type)}</span>
        <span class="qi-badge qi-badge--${q.difficulty ?? 'medium'}">${esc(diffLabel)}</span>
        ${trackLabel ? `<span class="qi-badge qi-badge--practice">${esc(trackLabel)}</span>` : ''}
        ${q.topic ? `<span class="qi-badge qi-badge--type">${esc(TOPIC_LABELS[q.topic] ?? q.topic)}</span>` : ''}
        ${q.isOlympiad
          ? '<span class="qi-badge qi-badge--olympiad">Основний тур</span>'
          : (q.channels?.length
              ? q.channels.map(channel => `<span class="qi-badge qi-badge--practice">${esc(CHANNEL_LABELS[channel] ?? channel)}</span>`).join('')
              : '<span class="qi-badge qi-badge--type">Без розділу</span>')}
      </div>
      <p class="question-item__text">${esc(q.q)}</p>
      ${q.code ? `<p class="question-item__code">${esc(q.code.split('\n')[0])}…</p>` : ''}
      <p class="question-item__meta">✓ ${esc(correctHint)} · контент v${esc(String(q.version ?? 1))} · редакція ${esc(String(q.editVersion ?? 1))}</p>
    </div>
    <div class="question-item__actions">
      <button class="btn-q-edit btn-adm-slate btn-icon" aria-label="Редагувати питання"><i class="fas fa-pen" aria-hidden="true"></i></button>
      <button class="btn-q-copy btn-adm-ghost btn-icon" aria-label="Дублювати питання"><i class="fas fa-copy" aria-hidden="true"></i></button>
      <button class="btn-q-history btn-adm-ghost btn-icon" aria-label="Історія питання"><i class="fas fa-history" aria-hidden="true"></i></button>
      <button class="btn-q-status btn-adm-sky btn--sm">${nextLabel}</button>
      ${status === 'draft' ? '<button class="btn-q-del btn-adm-danger btn-icon" aria-label="Видалити чернетку"><i class="fas fa-trash" aria-hidden="true"></i></button>' : ''}
    </div>`

  el.querySelector<HTMLButtonElement>('.btn-q-edit')!.setAttribute(
    'aria-label', immutable ? 'Створити нову версію як чернетку' : 'Редагувати питання',
  )
  el.querySelector<HTMLButtonElement>('.btn-q-edit')!.addEventListener('click', () => openQuestionModal(q, immutable))
  el.querySelector<HTMLButtonElement>('.btn-q-copy')!.addEventListener('click', () => openQuestionModal(q, true))
  el.querySelector<HTMLButtonElement>('.btn-q-history')!.addEventListener('click', () => { void openHistory(q) })
  el.querySelector<HTMLButtonElement>('.btn-q-status')!.addEventListener('click', () => {
    showConfirm(`${nextLabel} це питання?`, async () => {
      try {
        await setQuestionEditorialStatus(q.id, nextStatus, q.editVersion ?? 1)
        await loadQuestionsTab()
        void refreshContentDeliveryBanner()
      } catch (err) { showModal((err as Error).message) }
    })
  })
  el.querySelector<HTMLButtonElement>('.btn-q-del')?.addEventListener('click', () => {
    showConfirm(
      `Видалити чернетку?\n\n«${q.q.slice(0, 80)}${q.q.length > 80 ? '…' : ''}»\n\nЦю дію неможливо скасувати.`,
      async () => {
        try {
          await deleteQuestion(q.id)
          await loadQuestionsTab()
          void refreshContentDeliveryBanner()
        } catch (err) {
          showModal((err as Error).message)
        }
      }
    )
  })

  return el
}

async function openHistory(question: Question) {
  try {
    const { revisions } = await getQuestionRevisions(question.id)
    const overlay = document.createElement('div')
    overlay.className = 'admin-modal-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-labelledby', 'question-history-title')
    overlay.innerHTML = `
      <div class="admin-modal-card question-history-card">
        <div class="admin-section-header">
          <h3 id="question-history-title" class="admin-section-title">Історія питання</h3>
          <button type="button" class="btn-adm-ghost history-close">Закрити</button>
        </div>
        <p class="admin-section-note">Кожне відновлення створює нову чернетку — попередня історія не зникає.</p>
        <div class="admin-list admin-list--sm history-list"></div>
      </div>`
    const list = overlay.querySelector<HTMLElement>('.history-list')!
    for (const revision of revisions) {
      const snapshot = revision.snapshot
      const status = String(snapshot.editorialStatus ?? snapshot.editorial_status ?? '—')
      const text = String(snapshot.q ?? '(без тексту)')
      const item = document.createElement('div')
      item.className = 'question-item'
      item.innerHTML = `
        <div class="question-item__left">
          <div class="question-item__badges">
            <span class="qi-badge qi-badge--type">редакція ${revision.editVersion}</span>
            <span class="qi-badge qi-badge--type">${esc(revision.action)}</span>
            <span class="qi-badge qi-badge--type">${esc(status)}</span>
          </div>
          <p class="question-item__text">${esc(text)}</p>
          <p class="question-item__meta">${esc(new Date(revision.createdAt).toLocaleString('uk-UA'))}</p>
        </div>
        ${!question.publishedAt && question.editorialStatus !== 'published' && revision.editVersion !== (question.editVersion ?? 1)
          ? '<div class="question-item__actions"><button type="button" class="btn-adm-sky btn--sm history-restore">Відновити</button></div>'
          : ''}`
      item.querySelector<HTMLButtonElement>('.history-restore')?.addEventListener('click', () => {
        close()
        showConfirm(`Відновити редакцію ${revision.editVersion} як нову чернетку?`, async () => {
          try {
            await restoreQuestionRevision(question.id, revision.editVersion, question.editVersion ?? 1)
            await loadQuestionsTab()
          } catch (err) { showModal((err as Error).message) }
        })
      })
      list.appendChild(item)
    }
    document.body.appendChild(overlay)
    let removeTrap: () => void = () => {}
    const close = () => {
      removeTrap()
      overlay.remove()
    }
    removeTrap = createFocusTrap(overlay, close)
    overlay.querySelector<HTMLButtonElement>('.history-close')!.addEventListener('click', close)
    overlay.addEventListener('click', event => { if (event.target === overlay) close() })
  } catch (err) {
    showModal((err as Error).message)
  }
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function openQuestionModal(q: Question | null, duplicate = false) {
  $('question-modal-title').textContent                 = duplicate && (q?.editorialStatus === 'published' || q?.publishedAt)
    ? 'Нова версія як чернетка' : duplicate ? 'Дублювати питання' : q ? 'Редагувати питання' : 'Нове питання'
  $<HTMLInputElement>('qf-id').value                    = duplicate ? '' : q?.id ?? ''
  $<HTMLSelectElement>('qf-grade').value                = String(q?.grade ?? '1')
  $<HTMLSelectElement>('qf-difficulty').value           = q?.difficulty ?? 'medium'
  $<HTMLSelectElement>('qf-track').value                = q?.track ?? ''
  fillTopicSelect($<HTMLSelectElement>('qf-topic'), q?.track ?? '', 'Без теми')
  $<HTMLSelectElement>('qf-topic').value                = q?.topic ?? ''
  $<HTMLSelectElement>('qf-concept').value              = q?.conceptKey ?? ''
  $<HTMLSelectElement>('qf-band').value                 = q?.progressionBand ?? ''
  ;($<HTMLInputElement>('qf-olympiad')).checked         = q?.isOlympiad ?? false
  for (const [channel, inputId] of Object.entries(CHANNEL_INPUTS) as [QuestionChannel, string][]) {
    $<HTMLInputElement>(inputId).checked = q?.channels?.includes(channel) ?? false
  }
  syncDistributionUI()
  $<HTMLTextAreaElement>('qf-q').value                  = q?.q ?? ''
  $<HTMLTextAreaElement>('qf-explanation').value        = q?.explanation ?? ''
  $<HTMLTextAreaElement>('qf-code').value               = q?.code ?? ''

  resetTypeFields()
  const type = q?.type ?? 'choice'
  populateTypeFields(type, q)

  const imgUrl = (q as any)?.img ?? ''
  $<HTMLInputElement>('qf-img').value = imgUrl
  $<HTMLInputElement>('qf-image-alt').value = q?.imageAlt ?? ''
  const prev = $maybe<HTMLImageElement>('qf-img-preview')
  if (prev) {
    if (imgUrl) { prev.src = imgUrl; prev.classList.remove('hidden') }
    else        { prev.classList.add('hidden'); prev.src = '' }
  }

  $<HTMLSelectElement>('qf-type').value = type
  applyTypeUI(type)

  qfError.textContent = ''
  questionModal.classList.remove('hidden')
  _qModalTrapRemove?.()
  _qModalTrapRemove = createFocusTrap(questionModal, closeQuestionModal)
}

export function closeQuestionModal() {
  _qModalTrapRemove?.()
  _qModalTrapRemove = null
  questionModal.classList.add('hidden')
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function handleSubmit(e: Event) {
  e.preventDefault()
  qfError.textContent = ''

  const id = $<HTMLInputElement>('qf-id').value
  const q  = $<HTMLTextAreaElement>('qf-q').value.trim()
  if (!q) { qfError.textContent = 'Введи текст питання.'; return }

  let shape
  try {
    shape = collectQuestionShape()
  } catch (err) {
    qfError.textContent = (err as Error).message
    return
  }

  const data = {
    q,
    ...shape,
    grade:       Number($<HTMLSelectElement>('qf-grade').value),
    difficulty:  $<HTMLSelectElement>('qf-difficulty').value,
    track:       $<HTMLSelectElement>('qf-track').value || null,
    topic:       $<HTMLSelectElement>('qf-topic').value || null,
    conceptKey:  $<HTMLSelectElement>('qf-concept').value || null,
    progressionBand: ($<HTMLSelectElement>('qf-band').value || null) as 'recognize' | 'apply' | 'reason' | null,
    isOlympiad:  $<HTMLInputElement>('qf-olympiad').checked,
    channels:    selectedChannels(),
    explanation: $<HTMLTextAreaElement>('qf-explanation').value.trim(),
    code:        $<HTMLTextAreaElement>('qf-code').value.trim() || undefined,
    img:         $<HTMLInputElement>('qf-img').value.trim() || null,
    imageAlt:    $<HTMLInputElement>('qf-image-alt').value.trim() || null,
  }

  qfSubmitBtn.disabled    = true
  qfSubmitBtn.textContent = 'Збереження…'
  try {
    if (id) {
      const current = currentQuestions.find(question => question.id === id)
      if (!current) throw new Error('Питання змінилося або список застарів. Онови вкладку.')
      await updateQuestion(id, { ...data, expectedEditVersion: current.editVersion ?? 1 })
    }
    else    await createQuestion(data)
    closeQuestionModal()
    await loadQuestionsTab()
    void refreshContentDeliveryBanner()
  } catch (err) {
    qfError.textContent = (err as Error).message
  } finally {
    qfSubmitBtn.disabled    = false
    qfSubmitBtn.textContent = 'Зберегти'
  }
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function handlePreviewClick() {
  let shape
  try {
    shape = collectQuestionShape()
  } catch (err) {
    qfError.textContent = (err as Error).message
    return
  }
  qfError.textContent = ''

  const q = {
    type:        shape.type,
    q:           $<HTMLTextAreaElement>('qf-q').value.trim() || '(текст питання)',
    options:     shape.options,
    correct:     shape.correct,
    img:         $<HTMLInputElement>('qf-img').value.trim() || null,
    imageAlt:    $<HTMLInputElement>('qf-image-alt').value.trim() || null,
    code:        $<HTMLTextAreaElement>('qf-code').value.trim() || null,
    explanation: $<HTMLTextAreaElement>('qf-explanation').value.trim(),
    ...(Array.isArray(shape.options) ? { a: shape.options } : shape.options),
  }

  $('pv-question-text').textContent = q.q
  const pvImg = $maybe<HTMLImageElement>('pv-image')
  if (pvImg) {
    if (q.img) { pvImg.src = q.img; pvImg.alt = q.imageAlt || 'Зображення до питання'; pvImg.classList.remove('hidden') }
    else       { pvImg.classList.add('hidden'); pvImg.src = '' }
  }

  const pvCode = $maybe('pv-code')
  if (pvCode) {
    if (q.code) { pvCode.textContent = q.code; pvCode.classList.remove('hidden') }
    else        { pvCode.classList.add('hidden') }
  }

  const pvOpts = $<HTMLElement>('pv-options')
  pvOpts.className = 'pv-options pv-options--grid'
  renderQuestion(q, pvOpts, { preview: true })

  const explWrap = $maybe('pv-explanation-wrap')
  if (explWrap) {
    if (q.explanation) {
      $('pv-explanation').textContent = q.explanation
      explWrap.classList.remove('hidden')
    } else {
      explWrap.classList.add('hidden')
    }
  }

  previewModal.classList.remove('hidden')
  _pvTrapRemove?.()
  _pvTrapRemove = createFocusTrap(previewModal, closePreview)
}

function closePreview() {
  _pvTrapRemove?.()
  _pvTrapRemove = null
  previewModal.classList.add('hidden')
}

// ─── applyTypeUI ──────────────────────────────────────────────────────────────

export function applyTypeUI(type: string) {
  Object.values(QF_SECTIONS).forEach(id => $maybe(id)?.classList.add('hidden'))
  $maybe(QF_SECTIONS[type] ?? 'qf-section-choice')?.classList.remove('hidden')
  const showCode = ['choice', 'sort', 'algorithm'].includes(type)
  $maybe('qf-code-wrap')?.classList.toggle('hidden', !showCode)
}

function resetTypeFields() {
  document.querySelectorAll<HTMLInputElement>('input[type="radio"][name^="qf-"]').forEach(inp => { inp.checked = false })
  document.querySelectorAll<HTMLInputElement>('.qf-opt, .qf-seq-opt').forEach(inp => { inp.value = '' })
  $<HTMLTextAreaElement>('qf-items').value = ''
  $<HTMLInputElement>('qf-correct-order').value = ''
  $<HTMLInputElement>('qf-given').value = ''
  $<HTMLTextAreaElement>('qf-left').value = ''
  $<HTMLTextAreaElement>('qf-right').value = ''
  $<HTMLInputElement>('qf-pairs').value = ''
  $<HTMLInputElement>('qf-input-correct').value = ''
  $<HTMLSelectElement>('qf-input-type').value = 'text'
}

function populateTypeFields(type: QuestionType, q: Question | null) {
  if (!q) return
  const options = asOptionsObject(q.options)

  if (type === 'choice') {
    populateInputs('.qf-opt', Array.isArray(q.options) ? q.options : [])
    checkRadio('qf-correct', String(q.correct ?? 0))
  } else if (type === 'truefalse') {
    checkRadio('qf-tf-correct', q.correct === 1 ? 'false' : 'true')
  } else if (type === 'sort') {
    $<HTMLTextAreaElement>('qf-items').value = asStringList(options['items']).join('\n')
    $<HTMLInputElement>('qf-correct-order').value = asNumberList(options['correctOrder']).join(',')
  } else if (type === 'sequence') {
    $<HTMLInputElement>('qf-given').value = asStringList(options['given']).join(',')
    populateInputs('.qf-seq-opt', asStringList(options['choices']))
    checkRadio('qf-seq-correct', String(q.correct ?? 0))
  } else if (type === 'match') {
    $<HTMLTextAreaElement>('qf-left').value = asStringList(options['left']).join('\n')
    $<HTMLTextAreaElement>('qf-right').value = asStringList(options['right']).join('\n')
    $<HTMLInputElement>('qf-pairs').value = asNumberList(options['pairs']).join(',')
  } else if (type === 'input') {
    $<HTMLInputElement>('qf-input-correct').value = String(options['answer'] ?? '')
    $<HTMLSelectElement>('qf-input-type').value = options['inputType'] === 'number' ? 'number' : 'text'
  }
}

function collectQuestionShape(): { type: QuestionType; options: string[] | Record<string, unknown>; correct: number | null } {
  const type = $<HTMLSelectElement>('qf-type').value as QuestionType

  if (type === 'choice') {
    const options = inputValues('.qf-opt')
    const correct = checkedIndex('qf-correct')
    if (options.some(o => !o)) throw new Error('Заповни всі 4 варіанти.')
    if (correct === null) throw new Error('Вибери правильну відповідь.')
    return { type, options, correct }
  }

  if (type === 'truefalse') {
    const selected = document.querySelector<HTMLInputElement>('input[name="qf-tf-correct"]:checked')
    if (!selected) throw new Error('Вибери правильну відповідь.')
    return { type, options: ['Так', 'Ні'], correct: selected.value === 'true' ? 0 : 1 }
  }

  if (type === 'sort') {
    const items = splitLines($<HTMLTextAreaElement>('qf-items').value)
    const correctOrder = parseIndexList($<HTMLInputElement>('qf-correct-order').value)
    if (items.length < 2) throw new Error('Додай щонайменше 2 елементи.')
    if (correctOrder.length !== items.length) throw new Error('Вкажи індекс кожного елемента у правильному порядку.')
    if ([...correctOrder].sort((a, b) => a - b).some((index, position) => index !== position)) {
      throw new Error('Правильний порядок має містити кожен індекс рівно один раз.')
    }
    return { type, options: { items, correctOrder }, correct: null }
  }

  if (type === 'sequence') {
    const given = splitComma($<HTMLInputElement>('qf-given').value)
    const choices = inputValues('.qf-seq-opt')
    const correct = checkedIndex('qf-seq-correct')
    if (!given.length) throw new Error('Вкажи задану послідовність.')
    if (choices.some(o => !o)) throw new Error('Заповни всі 4 варіанти.')
    if (correct === null) throw new Error('Вибери правильну відповідь.')
    return { type, options: { given, choices }, correct }
  }

  if (type === 'match') {
    const left = splitLines($<HTMLTextAreaElement>('qf-left').value)
    const right = splitLines($<HTMLTextAreaElement>('qf-right').value)
    const pairs = parseIndexList($<HTMLInputElement>('qf-pairs').value)
    if (!left.length || !right.length) throw new Error('Заповни обидва стовпці.')
    if (pairs.length !== left.length) throw new Error('Вкажи індекс пари для кожного рядка ліворуч.')
    if (new Set(right).size !== right.length) throw new Error('Значення правого стовпця мають бути унікальними.')
    if (pairs.some(index => index >= right.length)) throw new Error('Індекс пари виходить за межі правого стовпця.')
    return { type, options: { left, right, pairs }, correct: null }
  }

  const inputType = $<HTMLSelectElement>('qf-input-type').value === 'number' ? 'number' : 'text'
  const rawAnswer = $<HTMLInputElement>('qf-input-correct').value.trim()
  if (!rawAnswer) throw new Error('Вкажи правильну відповідь.')
  const answer = inputType === 'number' ? Number(rawAnswer) : rawAnswer
  if (inputType === 'number' && !Number.isFinite(answer)) throw new Error('Правильна відповідь має бути числом.')
  return { type, options: { answer, inputType }, correct: null }
}

function describeCorrectAnswer(q: Question): string {
  const type = q.type ?? 'choice'
  const options = asOptionsObject(q.options)
  if (type === 'choice') return String(Array.isArray(q.options) ? q.options[q.correct ?? -1] ?? '—' : '—')
  if (type === 'truefalse') return q.correct === 0 ? 'Так' : q.correct === 1 ? 'Ні' : '—'
  if (type === 'sequence') return String(asStringList(options['choices'])[q.correct ?? -1] ?? '—')
  if (type === 'sort') return describeIndexedList(options['items'], options['correctOrder'])
  if (type === 'match') {
    const left = asStringList(options['left'])
    const right = asStringList(options['right'])
    return left.map((item, i) => `${item} → ${right[asNumberList(options['pairs'])[i]] ?? '?'}`).join('; ') || '—'
  }
  return String(options['answer'] ?? '—')
}

function describeIndexedList(itemsValue: unknown, indexesValue: unknown): string {
  const items = asStringList(itemsValue)
  const indexes = asNumberList(indexesValue)
  return indexes.map(index => items[index] ?? '?').join(' → ') || '—'
}

function populateInputs(selector: string, values: string[]) {
  document.querySelectorAll<HTMLInputElement>(selector).forEach((inp, i) => { inp.value = values[i] ?? '' })
}

function inputValues(selector: string): string[] {
  return [...document.querySelectorAll<HTMLInputElement>(selector)].map(inp => inp.value.trim())
}

function checkRadio(name: string, value: string) {
  const radio = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)
  if (radio) radio.checked = true
}

function checkedIndex(name: string): number | null {
  const radio = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)
  return radio ? Number(radio.value) : null
}

function splitLines(value: string): string[] {
  return value.split('\n').map(item => item.trim()).filter(Boolean)
}

function splitComma(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function parseIndexList(value: string): number[] {
  if (!value.trim()) return []
  const indexes = value.split(',').map(item => Number(item.trim()))
  if (indexes.some(index => !Number.isInteger(index) || index < 0)) {
    throw new Error('Індекси мають бути цілими невід’ємними числами через кому.')
  }
  return indexes
}

function asOptionsObject(options: Question['options']): Record<string, unknown> {
  return options && typeof options === 'object' && !Array.isArray(options) ? options : {}
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function asNumberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : []
}
