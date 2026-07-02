import { getAdminQuestions, createQuestion, updateQuestion, deleteQuestion, type Question, type QuestionType } from '../../features/api/client.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { renderQuestion }  from '../../utils/question-renderer.js'
import { esc, showModal, showConfirm }  from './ui.js'
import { $, $maybe } from '../../utils/dom.js'

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
    const typeRaw    = $<HTMLSelectElement>('q-filter-type').value
    const isOlympiad = typeRaw !== '' ? typeRaw === 'true' : undefined
    const difficulty = $<HTMLSelectElement>('q-filter-difficulty').value || undefined
    const track      = $<HTMLSelectElement>('q-filter-track').value || undefined

    const { questions } = await getAdminQuestions({ grade, isOlympiad, difficulty, track })
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
    error.style.cssText = 'color:var(--clr-danger);padding:var(--sp-4)'
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
  const el = document.createElement('div')
  el.className = 'question-item'
  el.innerHTML = `
    <div class="question-item__left">
      <div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-bottom:var(--sp-2)">
        <span class="qi-badge qi-badge--grade">${esc(String(q.grade))} клас</span>
        <span class="qi-badge qi-badge--type">${esc(TYPE_LABELS[type] ?? type)}</span>
        <span class="qi-badge qi-badge--${q.difficulty ?? 'medium'}">${esc(diffLabel)}</span>
        ${trackLabel ? `<span class="qi-badge qi-badge--practice">${esc(trackLabel)}</span>` : ''}
        ${q.isOlympiad
          ? '<span class="qi-badge qi-badge--olympiad">Олімпіада</span>'
          : '<span class="qi-badge qi-badge--practice">Тренування</span>'}
      </div>
      <p class="question-item__text">${esc(q.q)}</p>
      ${q.code ? `<p class="question-item__code">${esc(q.code.split('\n')[0])}…</p>` : ''}
      <p class="question-item__meta">✓ ${esc(correctHint)}</p>
    </div>
    <div class="question-item__actions">
      <button class="btn-q-edit btn-adm-slate btn-icon" aria-label="Редагувати питання"><i class="fas fa-pen" aria-hidden="true"></i></button>
      <button class="btn-q-del  btn-adm-danger btn-icon" aria-label="Видалити питання"><i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>`

  el.querySelector<HTMLButtonElement>('.btn-q-edit')!.addEventListener('click', () => openQuestionModal(q))
  el.querySelector<HTMLButtonElement>('.btn-q-del')!.addEventListener('click', () => {
    showConfirm(
      `Видалити питання?\n\n«${q.q.slice(0, 80)}${q.q.length > 80 ? '…' : ''}»\n\nЦю дію неможливо скасувати.`,
      async () => {
        try {
          await deleteQuestion(q.id)
          await loadQuestionsTab()
        } catch (err) {
          showModal((err as Error).message)
        }
      }
    )
  })

  return el
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function openQuestionModal(q: Question | null) {
  $('question-modal-title').textContent                 = q ? 'Редагувати питання' : 'Нове питання'
  $<HTMLInputElement>('qf-id').value                    = q?.id ?? ''
  $<HTMLSelectElement>('qf-grade').value                = String(q?.grade ?? '1')
  $<HTMLSelectElement>('qf-difficulty').value           = q?.difficulty ?? 'medium'
  $<HTMLSelectElement>('qf-track').value                = q?.track ?? ''
  ;($<HTMLInputElement>('qf-olympiad')).checked         = q?.isOlympiad ?? false
  $<HTMLTextAreaElement>('qf-q').value                  = q?.q ?? ''
  $<HTMLTextAreaElement>('qf-explanation').value        = q?.explanation ?? ''
  $<HTMLTextAreaElement>('qf-code').value               = q?.code ?? ''

  resetTypeFields()
  const type = q?.type ?? 'choice'
  populateTypeFields(type, q)

  const imgUrl = (q as any)?.img ?? ''
  $<HTMLInputElement>('qf-img').value = imgUrl
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
    isOlympiad:  $<HTMLInputElement>('qf-olympiad').checked,
    explanation: $<HTMLTextAreaElement>('qf-explanation').value.trim(),
    code:        $<HTMLTextAreaElement>('qf-code').value.trim() || undefined,
  }

  qfSubmitBtn.disabled    = true
  qfSubmitBtn.textContent = 'Збереження…'
  try {
    if (id) await updateQuestion(id, data)
    else    await createQuestion(data)
    closeQuestionModal()
    await loadQuestionsTab()
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
    code:        $<HTMLTextAreaElement>('qf-code').value.trim() || null,
    explanation: $<HTMLTextAreaElement>('qf-explanation').value.trim(),
    ...(Array.isArray(shape.options) ? { a: shape.options } : shape.options),
  }

  $('pv-question-text').textContent = q.q
  const pvImg = $maybe<HTMLImageElement>('pv-image')
  if (pvImg) {
    if (q.img) { pvImg.src = q.img; pvImg.classList.remove('hidden') }
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
