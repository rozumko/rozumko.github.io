// TODO: замінити DOM-кастинги (HTMLElement → HTMLInputElement/HTMLSelectElement) під час рефакторингу форми питань
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { getAdminQuestions, createQuestion, updateQuestion, deleteQuestion } from '../../features/api/client.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { renderQuestion }  from '../../utils/question-renderer.js'
import { esc, showModal }  from './ui.js'

let currentQuestions = []

const questionModal = document.getElementById('question-modal')
const questionForm  = document.getElementById('question-form')
const qfError       = document.getElementById('qf-error')
const qfSubmitBtn   = document.getElementById('qf-submit')

let _qModalTrapRemove = null
let _pvTrapRemove     = null

const previewModal = document.getElementById('preview-modal')

const QF_SECTIONS = {
  choice:    'qf-section-choice',
  sort:      'qf-section-sort',
  sequence:  'qf-section-sequence',
  match:     'qf-section-match',
  truefalse: 'qf-section-truefalse',
  input:     'qf-section-input',
}

const DIFF_LABELS = { easy: 'Легке', medium: 'Середнє', hard: 'Складне' }

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initQuestionsTab() {
  document.getElementById('add-question-btn').addEventListener('click', () => openQuestionModal(null))
  document.getElementById('qf-cancel').addEventListener('click', closeQuestionModal)
  document.getElementById('preview-close').addEventListener('click', closePreview)
  previewModal.addEventListener('click', (e) => { if (e.target === previewModal) closePreview() })
  document.getElementById('qf-type').addEventListener('change', (e) => applyTypeUI(e.target.value))
  document.getElementById('q-filter-apply').addEventListener('click', () => loadQuestionsTab())
  document.getElementById('qf-img').addEventListener('input', (e) => {
    const prev = document.getElementById('qf-img-preview')
    const url  = e.target.value.trim()
    if (url) { prev.src = url; prev.classList.remove('hidden') }
    else     { prev.classList.add('hidden'); prev.src = '' }
  })
  questionForm.addEventListener('submit', handleSubmit)
  document.getElementById('qf-preview').addEventListener('click', handlePreviewClick)
}

// ─── List ──────────────────────────────────────────────────────────────────────

export async function loadQuestionsTab() {
  const list = document.getElementById('questions-list')
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'
  try {
    const grade      = document.getElementById('q-filter-grade').value || undefined
    const typeRaw    = document.getElementById('q-filter-type').value
    const isOlympiad = typeRaw !== '' ? typeRaw === 'true' : undefined
    const difficulty = document.getElementById('q-filter-difficulty').value || undefined

    const { questions } = await getAdminQuestions({ grade, isOlympiad, difficulty })
    currentQuestions = questions

    document.getElementById('q-count').textContent = `${questions.length} питань`

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
    list.innerHTML = `<p style="color:var(--clr-danger);padding:var(--sp-4)">${err.message}</p>`
  }
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function buildQuestionCard(q) {
  const diffLabel = DIFF_LABELS[q.difficulty] ?? q.difficulty ?? '—'
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
      <button class="btn-q-edit btn-adm-slate btn-icon" title="Редагувати"><i class="fas fa-pen"></i></button>
      <button class="btn-q-del  btn-adm-danger btn-icon" title="Видалити"><i class="fas fa-trash"></i></button>
    </div>`

  el.querySelector('.btn-q-edit').addEventListener('click', () => openQuestionModal(q))
  el.querySelector('.btn-q-del').addEventListener('click', async () => {
    if (!confirm('Видалити питання?')) return
    try {
      await deleteQuestion(q.id)
      await loadQuestionsTab()
    } catch (err) {
      showModal(err.message)
    }
  })

  return el
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function openQuestionModal(q) {
  document.getElementById('question-modal-title').textContent = q ? 'Редагувати питання' : 'Нове питання'
  document.getElementById('qf-id').value          = q?.id ?? ''
  document.getElementById('qf-grade').value       = q?.grade ?? '1'
  document.getElementById('qf-difficulty').value  = q?.difficulty ?? 'medium'
  document.getElementById('qf-olympiad').checked  = q?.isOlympiad ?? false
  document.getElementById('qf-q').value           = q?.q ?? ''
  document.getElementById('qf-explanation').value = q?.explanation ?? ''
  document.getElementById('qf-code').value        = q?.code ?? ''

  // choice type — map options→opts for display
  const opts = q?.options ?? []
  document.querySelectorAll('.qf-opt').forEach((inp, i) => { inp.value = opts[i] ?? '' })
  const radio = document.querySelector(`input[name="qf-correct"][value="${q?.correct ?? 0}"]`)
  if (radio) radio.checked = true

  // Image
  const imgUrl = q?.img ?? ''
  document.getElementById('qf-img').value = imgUrl
  const prev = document.getElementById('qf-img-preview')
  if (imgUrl) { prev.src = imgUrl; prev.classList.remove('hidden') }
  else        { prev.classList.add('hidden'); prev.src = '' }

  // Always use 'choice' type (only type supported by DB)
  document.getElementById('qf-type').value = 'choice'
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

async function handleSubmit(e) {
  e.preventDefault()
  qfError.textContent = ''

  const id   = document.getElementById('qf-id').value
  const q    = document.getElementById('qf-q').value.trim()
  if (!q) { qfError.textContent = 'Введи текст питання.'; return }

  const opts      = [...document.querySelectorAll('.qf-opt')].map(i => i.value.trim())
  const correctEl = document.querySelector('input[name="qf-correct"]:checked')
  if (opts.some(o => !o)) { qfError.textContent = 'Заповни всі 4 варіанти.'; return }
  if (!correctEl)          { qfError.textContent = 'Вибери правильну відповідь.'; return }

  const data = {
    q,
    options:     opts,
    correct:     Number(correctEl.value),
    grade:       Number(document.getElementById('qf-grade').value),
    difficulty:  document.getElementById('qf-difficulty').value,
    isOlympiad:  document.getElementById('qf-olympiad').checked,
    explanation: document.getElementById('qf-explanation').value.trim(),
    code:        document.getElementById('qf-code').value.trim() || undefined,
  }

  qfSubmitBtn.disabled    = true
  qfSubmitBtn.textContent = 'Збереження…'
  try {
    if (id) await updateQuestion(id, data)
    else    await createQuestion(data)
    closeQuestionModal()
    await loadQuestionsTab()
  } catch (err) {
    qfError.textContent = err.message
  } finally {
    qfSubmitBtn.disabled    = false
    qfSubmitBtn.textContent = 'Зберегти'
  }
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function handlePreviewClick() {
  const opts      = [...document.querySelectorAll('.qf-opt')].map(i => i.value.trim() || '…')
  const correctEl = document.querySelector('input[name="qf-correct"]:checked')
  const q = {
    q:           document.getElementById('qf-q').value.trim() || '(текст питання)',
    a:           opts,
    options:     opts,
    correct:     correctEl ? Number(correctEl.value) : 0,
    img:         document.getElementById('qf-img').value.trim() || null,
    code:        document.getElementById('qf-code').value.trim() || null,
    explanation: document.getElementById('qf-explanation').value.trim(),
  }

  document.getElementById('pv-question-text').textContent = q.q
  const pvImg = document.getElementById('pv-image')
  if (q.img) { pvImg.src = q.img; pvImg.classList.remove('hidden') }
  else       { pvImg.classList.add('hidden'); pvImg.src = '' }

  const pvCode = document.getElementById('pv-code')
  if (q.code) { pvCode.textContent = q.code; pvCode.classList.remove('hidden') }
  else        { pvCode.classList.add('hidden') }

  const pvOpts = document.getElementById('pv-options')
  pvOpts.className = 'pv-options pv-options--grid'
  renderQuestion(q, pvOpts, { preview: true })

  const explWrap = document.getElementById('pv-explanation-wrap')
  if (q.explanation) {
    document.getElementById('pv-explanation').textContent = q.explanation
    explWrap.classList.remove('hidden')
  } else {
    explWrap.classList.add('hidden')
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

export function applyTypeUI(type) {
  Object.values(QF_SECTIONS).forEach(id => document.getElementById(id).classList.add('hidden'))
  document.getElementById(QF_SECTIONS[type] ?? 'qf-section-choice').classList.remove('hidden')
  const showCode = ['choice', 'sort', 'algorithm'].includes(type)
  document.getElementById('qf-code-wrap').classList.toggle('hidden', !showCode)
}
