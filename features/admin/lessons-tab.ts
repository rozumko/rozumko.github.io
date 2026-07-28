import {
  getAdminLessons, createAdminLesson, updateAdminLesson, setAdminLessonStatus,
  getAdminLessonRevisions, restoreAdminLessonRevision, getAdminPathMaps,
  type AdminMicroLesson, type AdminLessonContent, type AdminLessonCard, type AdminLessonCheckQuestion,
  type AdminPathMap,
} from '../../features/api/client.js'
import { esc, showModal, showConfirm } from './ui.js'
import { $ } from '../../utils/dom.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import { mountLesson } from '../../features/lessons/lesson-runner.js'
import type { PathPoint } from '../../features/path/path-data.js'
import { TOPIC_LABELS } from './taxonomy.js'
import { refreshContentDeliveryBanner } from './publication-tab.js'
import { createPager } from './pagination.js'

// Micro-lesson authoring. Publishing freezes an immutable revision; the site
// update action deploys all child-facing static bundles as one audited set.

const STATUS_LABELS: Record<AdminMicroLesson['status'], string> = {
  draft:     'Чернетка',
  review:    'Готовий до публікації',
  published: 'Опубліковано',
  archived:  'Знято з публікації',
}
const TRACK_LABELS: Record<string, string> = {
  informatics: 'Інформатика',
  'computational-thinking': 'Обчислювальне мислення',
  'ai-basics': 'Основи ШІ',
}

const pager = createPager({
  hostId: 'lessons-pager',
  storageKey: 'admin:lessons:page-size',
  noun: 'уроків',
  onChange: renderLessons,
})

let allLessons: AdminMicroLesson[] = []
let lessonUsageById = new Map<string, LessonUsage[]>()
let editingId: string | null = null
let editorTrapRemove: (() => void) | null = null

interface LessonUsage {
  grade: number
  pointId: string
  pointTitle: string
  tracks: string[]
  topics: string[]
}

export function initLessonsTab() {
  $<HTMLInputElement>('l-filter-search').addEventListener('input', restartLessonList)
  $<HTMLInputElement>('l-filter-search').addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const input = event.currentTarget as HTMLInputElement
      input.value = ''
      restartLessonList()
    }
  })
  $<HTMLSelectElement>('l-filter-status').addEventListener('change', restartLessonList)
  $<HTMLSelectElement>('l-filter-grade').addEventListener('change', restartLessonList)
  $<HTMLSelectElement>('l-filter-track').addEventListener('change', event => {
    fillLessonTopicSelect((event.currentTarget as HTMLSelectElement).value)
    restartLessonList()
  })
  $<HTMLSelectElement>('l-filter-topic').addEventListener('change', restartLessonList)
  $<HTMLSelectElement>('l-filter-usage').addEventListener('change', restartLessonList)
  $<HTMLButtonElement>('l-filter-reset').addEventListener('click', () => {
    $<HTMLInputElement>('l-filter-search').value = ''
    $<HTMLSelectElement>('l-filter-status').value = ''
    $<HTMLSelectElement>('l-filter-grade').value = ''
    $<HTMLSelectElement>('l-filter-track').value = ''
    fillLessonTopicSelect('')
    $<HTMLSelectElement>('l-filter-usage').value = ''
    restartLessonList()
  })
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
    const [{ lessons }, { maps }] = await Promise.all([getAdminLessons(), getAdminPathMaps()])
    allLessons = lessons
    lessonUsageById = collectLessonUsage(maps)
    fillLessonTopicSelect($<HTMLSelectElement>('l-filter-track').value)
    renderLessons()
  } catch (err) {
    list.innerHTML = ''
    const error = document.createElement('p')
    error.className = 'admin-list-error'
    error.textContent = (err as Error).message
    list.appendChild(error)
  }
}

function collectLessonUsage(maps: AdminPathMap[]): Map<string, LessonUsage[]> {
  const usage = new Map<string, LessonUsage[]>()
  for (const map of maps) {
    for (const point of map.points as PathPoint[]) {
      for (const step of point.activities) {
        if (step.activity.kind !== 'lesson') continue
        const lessonId = step.activity.lessonId
        const item: LessonUsage = {
          grade: map.grade,
          pointId: point.id,
          pointTitle: point.title,
          tracks: [...new Set(point.curriculum.map(tag => tag.track))],
          topics: [...new Set(point.curriculum.map(tag => tag.topic))],
        }
        usage.set(lessonId, [...(usage.get(lessonId) ?? []), item])
      }
    }
  }
  return usage
}

function fillLessonTopicSelect(track: string) {
  const select = $<HTMLSelectElement>('l-filter-topic')
  const prev = select.value
  const topics = new Set<string>()
  for (const usages of lessonUsageById.values()) {
    for (const item of usages) {
      if (!track || item.tracks.includes(track)) {
        for (const topic of item.topics) topics.add(topic)
      }
    }
  }
  const sortedTopics = [...topics].sort((a, b) =>
    (TOPIC_LABELS[a] ?? a).localeCompare(TOPIC_LABELS[b] ?? b, 'uk'))
  select.innerHTML = '<option value="">Усі теми</option>' +
    sortedTopics.map(topic => `<option value="${esc(topic)}">${esc(TOPIC_LABELS[topic] ?? topic)}</option>`).join('')
  select.value = sortedTopics.includes(prev) ? prev : ''
  select.disabled = sortedTopics.length === 0
}

function filteredLessons(): AdminMicroLesson[] {
  const search = $<HTMLInputElement>('l-filter-search').value.trim().toLowerCase()
  const rawStatus = $<HTMLSelectElement>('l-filter-status').value
  const status = rawStatus === 'lesson-review' ? 'review' : rawStatus
  const grade = $<HTMLSelectElement>('l-filter-grade').value
  const track = $<HTMLSelectElement>('l-filter-track').value
  const topic = $<HTMLSelectElement>('l-filter-topic').value
  const usageFilter = $<HTMLSelectElement>('l-filter-usage').value

  return allLessons.filter(lesson => {
    const usage = lessonUsageById.get(lesson.id) ?? []
    if (status && lesson.status !== status) return false
    if (grade && !usage.some(item => item.grade === Number(grade))) return false
    if (track && !usage.some(item => item.tracks.includes(track))) return false
    if (topic && !usage.some(item => item.topics.includes(topic))) return false
    if (usageFilter === 'used' && !usage.length) return false
    if (usageFilter === 'unused' && usage.length) return false
    if (search) {
      const haystack = [
        lesson.id, lesson.title, STATUS_LABELS[lesson.status],
        ...usage.flatMap(item => [
          item.pointId, item.pointTitle, `${item.grade} клас`,
          ...item.tracks.map(trackId => TRACK_LABELS[trackId] ?? trackId),
          ...item.topics.map(topicId => TOPIC_LABELS[topicId] ?? topicId),
        ]),
      ].join(' ').toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

function usageBadges(lesson: AdminMicroLesson): string {
  const usage = lessonUsageById.get(lesson.id) ?? []
  if (!usage.length) return '<span class="qi-badge qi-badge--type">поза картою</span>'
  return usage.map(item => {
    const topics = item.topics.map(topic => TOPIC_LABELS[topic] ?? topic).join(', ')
    return `<span class="qi-badge qi-badge--practice">${item.grade} клас · ${esc(item.pointTitle)}${topics ? ` · ${esc(topics)}` : ''}</span>`
  }).join('')
}

function renderLessons() {
  const list = $('lessons-list')
  const filtered = filteredLessons()
  const usedCount = allLessons.filter(lesson => (lessonUsageById.get(lesson.id) ?? []).length > 0).length
  $('l-count').textContent = `${filtered.length} із ${allLessons.length} уроків · на карті: ${usedCount}`

  if (!filtered.length) {
    pager.clear()
    list.innerHTML = `
      <div class="admin-empty-state"><div>
        <i class="fas fa-book-open admin-empty-state__icon" aria-hidden="true"></i>
        <p class="admin-empty-state__title">${allLessons.length ? 'Уроків за цими фільтрами не знайдено' : 'Уроків ще немає'}</p>
      </div></div>`
    return
  }

  // Lessons are a bounded, curated set and one filter ("на карті") is computed
  // from the path maps here, so the page is cut client-side after filtering.
  const { limit, offset } = pager.range()
  list.innerHTML = ''
  for (const lesson of filtered.slice(offset, offset + limit)) {
    const el = document.createElement('div')
    el.className = 'question-item'
    const statusBadge = lesson.status === 'published' ? 'qi-badge--easy'
      : lesson.status === 'draft' ? 'qi-badge--medium' : 'qi-badge--type'
    const nextStatus = lesson.status === 'draft' || lesson.status === 'review' ? 'published'
      : lesson.status === 'published' ? 'archived' : lesson.publishedVersion ? 'published' : 'draft'
    const nextLabel = lesson.status === 'draft' || lesson.status === 'review' ? 'Опублікувати'
      : lesson.status === 'published' ? 'Зняти з публікації' : lesson.publishedVersion ? 'Опублікувати знову' : 'Повернути в чернетки'
    el.innerHTML = `
      <div class="question-item__left">
        <div class="question-item__badges">
          <span class="qi-badge ${statusBadge}">${esc(STATUS_LABELS[lesson.status])}</span>
          <span class="qi-badge qi-badge--type">карток: ${lesson.cards.length}</span>
          <span class="qi-badge qi-badge--type">питань: ${lesson.checkQuestions.length}</span>
          ${lesson.videoUrl ? '<span class="qi-badge qi-badge--practice">відео</span>' : ''}
          ${usageBadges(lesson)}
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
  pager.apply({ total: filtered.length, limit, offset })
}

function restartLessonList() {
  pager.reset()
  renderLessons()
}

async function toggleStatus(lesson: AdminMicroLesson, next: AdminMicroLesson['status'], label: string) {
  const apply = async () => {
    try {
      await setAdminLessonStatus(lesson.id, next, lesson.editVersion)
      await loadLessonsTab()
      void refreshContentDeliveryBanner()
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
            void refreshContentDeliveryBanner()
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
    void refreshContentDeliveryBanner()
  } catch (err) {
    errorEl.textContent = (err as Error).message
  } finally {
    submit.disabled = false
  }
}
