import { getAdminQuestions, createQuestion, updateQuestion, deleteQuestion, type Question } from '../../features/api/client.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { renderQuestion }  from '../../utils/question-renderer.js'
import { esc, showModal }  from './ui.js'
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

    const { questions } = await getAdminQuestions({ grade, isOlympiad, difficulty })
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
    list.innerHTML = `<p style="color:var(--clr-danger);padding:var(--sp-4)">${(err as Error).message}</p>`
  }
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function buildQuestionCard(q: Question): HTMLElement {
  const diffLabel  = DIFF_LABELS[q.difficulty ?? ''] ?? q.difficulty ?? '—'
  const correctHint = q.options?.[q.correct] ?? '—'
  const el = document.createElement('div')
  el.className = 'question-item'
  el.innerHTML = `
    <div class="question-item__left">
      <div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-bottom:var(--sp-2)">
        <span class="qi-badge qi-badge--grade">${esc(String(q.grade))} клас</span>
        <span class="qi-badge qi-badge--type">Вибір</span>
        <span class="qi-badge qi-badge--${q.difficulty ?? 'medium'}">${esc(diffLabel)}</span>
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
  el.querySelector<HTMLButtonElement>('.btn-q-del')!.addEventListener('click', async () => {
    if (!confirm('Видалити питання?')) return
    try {
      await deleteQuestion(q.id)
      await loadQuestionsTab()
    } catch (err) {
      showModal((err as Error).message)
    }
  })

  return el
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function openQuestionModal(q: Question | null) {
  $('question-modal-title').textContent                 = q ? 'Редагувати питання' : 'Нове питання'
  $<HTMLInputElement>('qf-id').value                    = q?.id ?? ''
  $<HTMLSelectElement>('qf-grade').value                = String(q?.grade ?? '1')
  $<HTMLSelectElement>('qf-difficulty').value           = q?.difficulty ?? 'medium'
  ;($<HTMLInputElement>('qf-olympiad')).checked         = q?.isOlympiad ?? false
  $<HTMLTextAreaElement>('qf-q').value                  = q?.q ?? ''
  $<HTMLTextAreaElement>('qf-explanation').value        = q?.explanation ?? ''
  $<HTMLTextAreaElement>('qf-code').value               = q?.code ?? ''

  const opts = q?.options ?? []
  document.querySelectorAll<HTMLInputElement>('.qf-opt').forEach((inp, i) => { inp.value = opts[i] ?? '' })
  const radio = document.querySelector<HTMLInputElement>(`input[name="qf-correct"][value="${q?.correct ?? 0}"]`)
  if (radio) radio.checked = true

  const imgUrl = (q as any)?.img ?? ''
  $<HTMLInputElement>('qf-img').value = imgUrl
  const prev = $maybe<HTMLImageElement>('qf-img-preview')
  if (prev) {
    if (imgUrl) { prev.src = imgUrl; prev.classList.remove('hidden') }
    else        { prev.classList.add('hidden'); prev.src = '' }
  }

  $<HTMLSelectElement>('qf-type').value = 'choice'
  applyTypeUI('choice')

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

  const opts      = [...document.querySelectorAll<HTMLInputElement>('.qf-opt')].map(i => i.value.trim())
  const correctEl = document.querySelector<HTMLInputElement>('input[name="qf-correct"]:checked')
  if (opts.some(o => !o)) { qfError.textContent = 'Заповни всі 4 варіанти.'; return }
  if (!correctEl)          { qfError.textContent = 'Вибери правильну відповідь.'; return }

  const data = {
    q,
    options:     opts,
    correct:     Number(correctEl.value),
    grade:       Number($<HTMLSelectElement>('qf-grade').value),
    difficulty:  $<HTMLSelectElement>('qf-difficulty').value,
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
  const opts      = [...document.querySelectorAll<HTMLInputElement>('.qf-opt')].map(i => i.value.trim() || '…')
  const correctEl = document.querySelector<HTMLInputElement>('input[name="qf-correct"]:checked')
  const q = {
    q:           $<HTMLTextAreaElement>('qf-q').value.trim() || '(текст питання)',
    a:           opts,
    options:     opts,
    correct:     correctEl ? Number(correctEl.value) : 0,
    img:         $<HTMLInputElement>('qf-img').value.trim() || null,
    code:        $<HTMLTextAreaElement>('qf-code').value.trim() || null,
    explanation: $<HTMLTextAreaElement>('qf-explanation').value.trim(),
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
