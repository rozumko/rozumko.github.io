import {
  getAdminLessons, createAdminLesson, updateAdminLesson, setAdminLessonStatus,
  getAdminLessonRevisions, restoreAdminLessonRevision,
  type AdminMicroLesson, type AdminLessonContent, type AdminLessonCard, type AdminLessonCheckQuestion,
} from '../../features/api/client.js'
import { esc, showModal, showConfirm } from './ui.js'
import { $ } from '../../utils/dom.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { mountLesson } from '../../features/lessons/lesson-runner.js'

// Micro-lesson authoring. Publishing freezes a reviewed revision; the separate
// publication tab deploys all child-facing static bundles as one audited set.

const STATUS_LABELS: Record<AdminMicroLesson['status'], string> = {
  draft:     'Чернетка',
  review:    'На перевірці',
  published: 'Опубліковано',
  archived:  'Архів',
}

let allLessons: AdminMicroLesson[] = []
let editingId: string | null = null
let editorTrapRemove: (() => void) | null = null

export function initLessonsTab() {
  $('add-lesson-btn').addEventListener('click', () => openEditor(null))
  $('lf-add-card').addEventListener('click', () => addCardRow())
  $('lf-add-check').addEventListener('click', () => addCheckRow())
  $('lf-cancel').addEventListener('click', closeEditor)
  $('lf-preview').addEventListener('click', () => openPreview(collectContent(), editingId ?? 'preview-lesson', 1))
  $<HTMLFormElement>('lesson-form').addEventListener('submit', (e) => { e.preventDefault(); void save() })
}

export async function loadLessonsTab() {
  const list = $('lessons-list')
  list.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'
  try {
    const { lessons } = await getAdminLessons()
    allLessons = lessons
    renderLessons()
  } catch (err) {
    list.innerHTML = ''
    const error = document.createElement('p')
    error.className = 'admin-list-error'
    error.textContent = (err as Error).message
    list.appendChild(error)
  }
}

function renderLessons() {
  const list = $('lessons-list')
  $('l-count').textContent = `${allLessons.length} уроків`

  if (!allLessons.length) {
    list.innerHTML = `
      <div class="admin-empty-state"><div>
        <i class="fas fa-book-open admin-empty-state__icon" aria-hidden="true"></i>
        <p class="admin-empty-state__title">Уроків ще немає</p>
      </div></div>`
    return
  }

  list.innerHTML = ''
  for (const lesson of allLessons) {
    const el = document.createElement('div')
    el.className = 'question-item'
    const statusBadge = lesson.status === 'published' ? 'qi-badge--easy'
      : lesson.status === 'draft' ? 'qi-badge--medium' : 'qi-badge--type'
    const nextStatus = lesson.status === 'draft' ? 'review' : lesson.status === 'review' ? 'published'
      : lesson.status === 'published' ? 'archived' : lesson.publishedVersion ? 'published' : 'draft'
    const nextLabel = lesson.status === 'draft' ? 'На перевірку' : lesson.status === 'review' ? 'Опублікувати'
      : lesson.status === 'published' ? 'Архівувати' : lesson.publishedVersion ? 'Опублікувати знову' : 'У чернетки'
    el.innerHTML = `
      <div class="question-item__left">
        <div class="question-item__badges">
          <span class="qi-badge ${statusBadge}">${esc(STATUS_LABELS[lesson.status])}</span>
          <span class="qi-badge qi-badge--type">карток: ${lesson.cards.length}</span>
          <span class="qi-badge qi-badge--type">питань: ${lesson.checkQuestions.length}</span>
          ${lesson.videoUrl ? '<span class="qi-badge qi-badge--practice">відео</span>' : ''}
        </div>
        <p class="question-item__text">${esc(lesson.title)}</p>
        <p class="question-item__meta">${esc(lesson.id)} · робоча v${lesson.version} · редакція ${lesson.editVersion}${lesson.publishedVersion ? ` · опублікована v${lesson.publishedVersion}` : ''}</p>
      </div>
      <div class="question-item__actions">
        <button type="button" class="btn-adm-ghost l-edit">Редагувати</button>
        <button type="button" class="btn-adm-ghost l-preview">Переглянути</button>
        <button type="button" class="btn-adm-ghost l-history">Історія</button>
        <button type="button" class="btn-adm-ghost l-toggle">
          ${nextLabel}
        </button>
      </div>`
    el.querySelector<HTMLButtonElement>('.l-edit')!
      .addEventListener('click', () => openEditor(lesson))
    el.querySelector<HTMLButtonElement>('.l-preview')!
      .addEventListener('click', () => openPreview({
        title: lesson.title, cards: lesson.cards, videoUrl: lesson.videoUrl,
        checkQuestions: lesson.checkQuestions,
      }, lesson.id, lesson.version))
    el.querySelector<HTMLButtonElement>('.l-history')!
      .addEventListener('click', () => { void openHistory(lesson) })
    el.querySelector<HTMLButtonElement>('.l-toggle')!
      .addEventListener('click', () => { void toggleStatus(lesson, nextStatus, nextLabel) })
    list.appendChild(el)
  }
}

async function toggleStatus(lesson: AdminMicroLesson, next: AdminMicroLesson['status'], label: string) {
  const apply = async () => {
    try {
      await setAdminLessonStatus(lesson.id, next, lesson.editVersion)
      await loadLessonsTab()
    } catch (err) {
      showModal((err as Error).message)
    }
  }
  if (next === 'published' || next === 'archived') {
    showConfirm(
      `${label} «${lesson.title}»? Зміна потрапить до дітей після наступної загальної публікації.`,
      () => { void apply() },
    )
    return
  }
  await apply()
}

function openPreview(content: AdminLessonContent, id: string, version: number) {
  const overlay = document.createElement('div')
  overlay.className = 'admin-modal-overlay lesson-preview-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Попередній перегляд уроку')
  overlay.innerHTML = `<div class="admin-modal-card lesson-preview-card">
    <div class="admin-section-header"><h3 class="admin-section-title">Дитячий перегляд</h3>
      <button type="button" class="btn-adm-ghost preview-close">Закрити</button></div>
    <div class="lesson-preview-root"></div></div>`
  document.body.appendChild(overlay)
  mountLesson(overlay.querySelector<HTMLElement>('.lesson-preview-root')!, {
    id, version, title: content.title, cards: content.cards,
    ...(content.videoUrl ? { videoUrl: content.videoUrl } : {}), check: content.checkQuestions,
  })
  let removeTrap: () => void = () => {}
  const close = () => { removeTrap(); overlay.remove() }
  removeTrap = createFocusTrap(overlay, close)
  overlay.querySelector<HTMLButtonElement>('.preview-close')!.addEventListener('click', close)
}

async function openHistory(lesson: AdminMicroLesson) {
  try {
    const { revisions } = await getAdminLessonRevisions(lesson.id)
    const overlay = document.createElement('div')
    overlay.className = 'admin-modal-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'Історія уроку')
    overlay.innerHTML = `<div class="admin-modal-card question-history-card">
      <div class="admin-section-header"><h3 class="admin-section-title">Історія уроку</h3>
        <button type="button" class="btn-adm-ghost history-close">Закрити</button></div>
      <div class="admin-list admin-list--sm history-list"></div></div>`
    const list = overlay.querySelector<HTMLElement>('.history-list')!
    for (const revision of revisions) {
      const item = document.createElement('div')
      item.className = 'question-item'
      item.innerHTML = `<div class="question-item__left">
        <div class="question-item__badges"><span class="qi-badge qi-badge--type">редакція ${revision.editVersion}</span>
          <span class="qi-badge qi-badge--type">${esc(revision.action)}</span></div>
        <p class="question-item__text">${esc(String(revision.snapshot.title ?? lesson.title))}</p>
        <p class="question-item__meta">${esc(new Date(revision.createdAt).toLocaleString('uk-UA'))}</p></div>
        ${revision.editVersion !== lesson.editVersion ? '<div class="question-item__actions"><button type="button" class="btn-adm-sky btn--sm history-restore">Відновити</button></div>' : ''}`
      item.querySelector<HTMLButtonElement>('.history-restore')?.addEventListener('click', () => {
        close()
        showConfirm(`Відновити редакцію ${revision.editVersion} як нову чернетку?`, async () => {
          try {
            await restoreAdminLessonRevision(lesson.id, revision.editVersion, lesson.editVersion)
            await loadLessonsTab()
          } catch (err) { showModal((err as Error).message) }
        })
      })
      list.appendChild(item)
    }
    document.body.appendChild(overlay)
    let removeTrap: () => void = () => {}
    const close = () => { removeTrap(); overlay.remove() }
    removeTrap = createFocusTrap(overlay, close)
    overlay.querySelector<HTMLButtonElement>('.history-close')!.addEventListener('click', close)
  } catch (err) { showModal((err as Error).message) }
}

// ── Редактор ──────────────────────────────────────────────────

function openEditor(lesson: AdminMicroLesson | null) {
  editingId = lesson?.id ?? null
  $('lesson-modal-title').textContent = lesson ? `Редагувати: ${lesson.title}` : 'Новий урок'
  $('lf-error').textContent = ''
  const idInput = $<HTMLInputElement>('lf-id')
  idInput.value = lesson?.id ?? ''
  idInput.disabled = !!lesson // slug незмінний: на нього посилаються точки шляху
  $<HTMLInputElement>('lf-title').value = lesson?.title ?? ''
  $<HTMLInputElement>('lf-video').value = lesson?.videoUrl ?? ''

  $('lf-cards').innerHTML = ''
  $('lf-checks').innerHTML = ''
  for (const card of lesson?.cards ?? [{ text: '' }]) addCardRow(card)
  for (const q of lesson?.checkQuestions ?? []) addCheckRow(q)

  $('lesson-modal').classList.remove('hidden')
  editorTrapRemove?.()
  editorTrapRemove = createFocusTrap($('lesson-modal'), closeEditor)
}

function closeEditor() {
  editorTrapRemove?.()
  editorTrapRemove = null
  $('lesson-modal').classList.add('hidden')
  editingId = null
}

function cloneTemplate(templateId: string, root: HTMLElement): HTMLElement {
  const template = $<HTMLTemplateElement>(templateId)
  const block = (template.content.cloneNode(true) as DocumentFragment).firstElementChild as HTMLElement
  block.querySelector<HTMLButtonElement>('.lf-remove')!
    .addEventListener('click', () => block.remove())
  root.appendChild(block)
  return block
}

function addCardRow(card?: AdminLessonCard) {
  const block = cloneTemplate('lf-card-template', $('lf-cards'))
  block.querySelector<HTMLInputElement>('.lf-card-title')!.value = card?.title ?? ''
  block.querySelector<HTMLInputElement>('.lf-card-image')!.value = card?.image ?? ''
  block.querySelector<HTMLInputElement>('.lf-card-alt')!.value = card?.imageAlt ?? ''
  block.querySelector<HTMLTextAreaElement>('.lf-card-text')!.value = card?.text ?? ''
}

function addCheckRow(q?: AdminLessonCheckQuestion) {
  const block = cloneTemplate('lf-check-template', $('lf-checks'))
  block.querySelector<HTMLInputElement>('.lf-check-question')!.value = q?.question ?? ''
  block.querySelector<HTMLTextAreaElement>('.lf-check-options')!.value = (q?.options ?? []).join('\n')
  block.querySelector<HTMLInputElement>('.lf-check-correct')!.value = String((q?.correct ?? 0) + 1)
  block.querySelector<HTMLInputElement>('.lf-check-explanation')!.value = q?.explanation ?? ''
}

/** Збирає форму в контент уроку. М'які поля тримає undefined — серверна
 * валідація fail-closed і поверне зрозумілу помилку автору. */
function collectContent(): AdminLessonContent {
  const cards: AdminLessonCard[] = [...$('lf-cards').querySelectorAll<HTMLElement>('.lf-block')].map(block => {
    const card: AdminLessonCard = {
      text: block.querySelector<HTMLTextAreaElement>('.lf-card-text')!.value,
    }
    const title = block.querySelector<HTMLInputElement>('.lf-card-title')!.value.trim()
    if (title) card.title = title
    const image = block.querySelector<HTMLInputElement>('.lf-card-image')!.value.trim()
    if (image) {
      card.image = image
      const alt = block.querySelector<HTMLInputElement>('.lf-card-alt')!.value.trim()
      if (alt) card.imageAlt = alt
    }
    return card
  })

  const checkQuestions: AdminLessonCheckQuestion[] = [...$('lf-checks').querySelectorAll<HTMLElement>('.lf-block')].map(block => {
    const options = block.querySelector<HTMLTextAreaElement>('.lf-check-options')!.value
      .split('\n').map(line => line.trim()).filter(Boolean)
    const q: AdminLessonCheckQuestion = {
      question: block.querySelector<HTMLInputElement>('.lf-check-question')!.value,
      options,
      correct: Number(block.querySelector<HTMLInputElement>('.lf-check-correct')!.value) - 1,
    }
    const explanation = block.querySelector<HTMLInputElement>('.lf-check-explanation')!.value.trim()
    if (explanation) q.explanation = explanation
    return q
  })

  return {
    title: $<HTMLInputElement>('lf-title').value,
    cards,
    videoUrl: $<HTMLInputElement>('lf-video').value.trim() || null,
    checkQuestions,
  }
}

async function save() {
  const errorEl = $('lf-error')
  errorEl.textContent = ''
  const submit = $<HTMLButtonElement>('lf-submit')
  submit.disabled = true
  try {
    const content = collectContent()
    if (editingId) {
      const current = allLessons.find(lesson => lesson.id === editingId)
      if (!current) throw new Error('Урок змінився або список застарів. Онови вкладку.')
      const { versionBumped } = await updateAdminLesson(editingId, { ...content, expectedEditVersion: current.editVersion })
      if (versionBumped) {
        showModal('Контент змінено — версію уроку піднято. Після перевірки опублікуй урок, а потім запусти загальну публікацію.')
      }
    } else {
      await createAdminLesson({ id: $<HTMLInputElement>('lf-id').value.trim(), ...content })
    }
    closeEditor()
    await loadLessonsTab()
  } catch (err) {
    errorEl.textContent = (err as Error).message
  } finally {
    submit.disabled = false
  }
}
