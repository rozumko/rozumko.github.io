import {
  getAdminLessons, createAdminLesson, updateAdminLesson, setAdminLessonStatus,
  type AdminMicroLesson, type AdminLessonContent, type AdminLessonCard, type AdminLessonCheckQuestion,
} from '../../features/api/client.js'
import { esc, showModal, showConfirm } from './ui.js'
import { $ } from '../../utils/dom.js'

// Вкладка «Уроки»: авторинг мікро-уроків (теорія перед випробуванням).
// Дітям контент їде статичним бандлом public/lessons/ (npm run export:lessons),
// тому збереження/публікація тут не змінюють дитячі сторінки до експорту.

const STATUS_LABELS: Record<AdminMicroLesson['status'], string> = {
  draft:     'Чернетка',
  published: 'Опубліковано',
  archived:  'Архів',
}

let allLessons: AdminMicroLesson[] = []
let editingId: string | null = null

export function initLessonsTab() {
  $('add-lesson-btn').addEventListener('click', () => openEditor(null))
  $('lf-add-card').addEventListener('click', () => addCardRow())
  $('lf-add-check').addEventListener('click', () => addCheckRow())
  $('lf-cancel').addEventListener('click', closeEditor)
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
    el.innerHTML = `
      <div class="question-item__left">
        <div class="question-item__badges">
          <span class="qi-badge ${statusBadge}">${esc(STATUS_LABELS[lesson.status])}</span>
          <span class="qi-badge qi-badge--type">карток: ${lesson.cards.length}</span>
          <span class="qi-badge qi-badge--type">питань: ${lesson.checkQuestions.length}</span>
          ${lesson.videoUrl ? '<span class="qi-badge qi-badge--practice">відео</span>' : ''}
        </div>
        <p class="question-item__text">${esc(lesson.title)}</p>
        <p class="question-item__meta">${esc(lesson.id)} · v${lesson.version}</p>
      </div>
      <div class="question-item__actions">
        <button type="button" class="btn-adm-ghost l-edit">Редагувати</button>
        <button type="button" class="btn-adm-ghost l-toggle">
          ${lesson.status === 'published' ? 'У чернетки' : 'Опублікувати'}
        </button>
      </div>`
    el.querySelector<HTMLButtonElement>('.l-edit')!
      .addEventListener('click', () => openEditor(lesson))
    el.querySelector<HTMLButtonElement>('.l-toggle')!
      .addEventListener('click', () => { void toggleStatus(lesson) })
    list.appendChild(el)
  }
}

async function toggleStatus(lesson: AdminMicroLesson) {
  const next = lesson.status === 'published' ? 'draft' : 'published'
  const apply = async () => {
    try {
      await setAdminLessonStatus(lesson.id, next)
      await loadLessonsTab()
    } catch (err) {
      showModal((err as Error).message)
    }
  }
  if (next === 'published') {
    showConfirm(
      `Опублікувати «${lesson.title}»? Урок потрапить у наступний export:lessons.`,
      () => { void apply() },
    )
    return
  }
  await apply()
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
}

function closeEditor() {
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
      const { versionBumped } = await updateAdminLesson(editingId, content)
      if (versionBumped) {
        showModal('Контент змінено — версію уроку піднято. Не забудь export:lessons після публікації.')
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
