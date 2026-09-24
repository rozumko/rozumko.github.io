// Lesson Engine teacher page (stage D): lesson list → teacher document →
// board presentation. Everything shown here comes from the teacher API, which
// serves only published, display-safe lessons and is dark unless the backend
// flag is on. The client never decides availability on its own.

import './frontend-security.js'
import {
  checkCurriculumActivity,
  getCurriculumLesson,
  getCurriculumLessons,
  getTeacherMe,
  getTeacherSession,
  type ApiError,
} from './features/api/client.js'
import { renderLessonDocument } from './features/lesson-engine/document-view.js'
import { openPresentation } from './features/lesson-engine/presentation-view.js'
import { lessonMetaLine } from './features/lesson-engine/projection.js'
import type { CurriculumLessonSummary, LessonDefinition } from './features/lesson-engine/types.js'

const statusEl = document.getElementById('le-status') as HTMLParagraphElement
const viewEl = document.getElementById('le-view') as HTMLDivElement

const LESSON_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

function setStatus(message: string, link?: { href: string; label: string }) {
  statusEl.replaceChildren(document.createTextNode(message))
  if (link) {
    const a = document.createElement('a')
    a.href = link.href
    a.textContent = link.label
    statusEl.append(' ', a)
  }
  statusEl.hidden = false
}

function clearStatus() {
  statusEl.hidden = true
  statusEl.textContent = ''
}

function renderLessonList(lessons: CurriculumLessonSummary[]) {
  const section = document.createElement('section')
  section.className = 'le-list-view'
  section.setAttribute('aria-labelledby', 'le-list-title')
  const h1 = document.createElement('h1')
  h1.id = 'le-list-title'
  h1.textContent = 'Уроки'
  section.append(h1)

  if (lessons.length === 0) {
    const empty = document.createElement('p')
    empty.textContent = 'Опублікованих уроків поки немає.'
    section.append(empty)
  }

  const grades = [...new Set(lessons.map(lesson => lesson.grade))].sort((a, b) => a - b)
  for (const grade of grades) {
    const h2 = document.createElement('h2')
    h2.textContent = `${grade} клас`
    const list = document.createElement('ul')
    list.className = 'le-lesson-list'
    for (const lesson of lessons.filter(item => item.grade === grade)) {
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.className = 'le-lesson-card'
      a.href = `?lesson=${encodeURIComponent(lesson.id)}`
      const title = document.createElement('span')
      title.className = 'le-lesson-card__title'
      title.textContent = lesson.title.uk
      const meta = document.createElement('span')
      meta.className = 'le-lesson-card__meta'
      meta.textContent = lessonMetaLine(lesson)
      a.append(title, meta)
      li.append(a)
      list.append(li)
    }
    section.append(h2, list)
  }
  viewEl.replaceChildren(section)
}

function renderLesson(lesson: LessonDefinition) {
  document.title = `${lesson.title.uk} — Розумко`
  const toolbar = document.createElement('div')
  toolbar.className = 'le-toolbar'
  const back = document.createElement('a')
  back.href = 'lesson-engine.html'
  back.className = 'le-toolbar__back'
  back.textContent = '← Усі уроки'
  const present = document.createElement('button')
  present.type = 'button'
  present.className = 'btn btn--teacher le-toolbar__present'
  present.textContent = 'Показати на дошці'
  toolbar.append(back, present)

  const start = (blockId?: string) => {
    const handle = openPresentation(lesson, {
      startBlockId: blockId,
      activities: { check: (instanceId, answer) => checkCurriculumActivity(lesson.id, instanceId, answer) },
    })
    if (!handle) setStatus('У цьому уроці немає слайдів для дошки.')
  }
  present.addEventListener('click', () => start())
  viewEl.replaceChildren(toolbar, renderLessonDocument(lesson, { onPresentFrom: start }))
}

async function main() {
  if (!getTeacherSession()?.accessToken) {
    setStatus('Щоб відкрити уроки, увійдіть у кабінет вчителя.', { href: 'teacher.html', label: 'Увійти' })
    return
  }

  try {
    const me = await getTeacherMe()
    if (!me.features?.lessonEngine) {
      setStatus('Керовані уроки ще недоступні.', { href: 'teacher.html', label: 'Повернутися до кабінету' })
      return
    }

    const lessonId = new URLSearchParams(location.search).get('lesson')
    if (lessonId !== null) {
      if (!LESSON_ID_RE.test(lessonId)) {
        setStatus('Урок не знайдено.', { href: 'lesson-engine.html', label: 'До списку уроків' })
        return
      }
      const { lesson } = await getCurriculumLesson(lessonId)
      clearStatus()
      renderLesson(lesson)
      return
    }

    const { lessons } = await getCurriculumLessons()
    clearStatus()
    renderLessonList(lessons)
  } catch (err) {
    const status = (err as ApiError).status
    if (status === 404) setStatus('Урок не знайдено.', { href: 'lesson-engine.html', label: 'До списку уроків' })
    else setStatus((err as Error).message || 'Не вдалося завантажити уроки.', { href: 'teacher.html', label: 'До кабінету' })
  }
}

void main()
