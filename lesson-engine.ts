// Lesson Engine teacher page (stage D): lesson list → teacher document →
// board presentation. Everything shown here comes from the teacher API, which
// serves only published, display-safe lessons and is dark unless the backend
// flag is on. The client never decides availability on its own.

import './frontend-security.js'
import {
  checkCurriculumActivity,
  closeLessonActivity,
  closeLessonRunJoin,
  createLessonRun,
  dispatchLessonActivity,
  getCurriculumLesson,
  getLessonRun,
  getLessonRunLive,
  getLessonRunReport,
  connectClassroomRemote,
  disconnectClassroomRemote,
  forgetClassLessonSeats,
  getClassroomRemoteConnection,
  getRunClassroomRemote,
  openRunOnClassroomRemote,
  getClassLessonLink,
  getDeviceAssignments,
  rotateClassLessonLink,
  setClassLessonLink,
  getTeacherClasses,
  launchLessonRun,
  saveDeviceAssignments,
  lessonRunAction,
  listLessonRunDevices,
  listLessonRuns,
  mapLessonRunDevice,
  openLessonRunJoin,
  revokeLessonRunDevice,
  setLessonRunStep,
  getCurriculumLessons,
  getTeacherMe,
  getTeacherSession,
  type ApiError,
} from './features/api/client.js'
import { renderLessonDocument } from './features/lesson-engine/document-view.js'
import { openPresentation } from './features/lesson-engine/presentation-view.js'
import { mountBoardWindow } from './features/lesson-engine/board-window.js'
import type { BoardActivityDeps } from './features/lesson-engine/activity-board.js'
import { lessonMetaLine } from './features/lesson-engine/projection.js'
import { mountRunConsole } from './features/lesson-engine/run-console.js'
import { renderLessonReport } from './features/lesson-engine/report-view.js'
import { resolveClassroomControlProvider, type ClassroomControlProvider } from './features/lesson-engine/classroom-control.js'
import { RUN_STATUS_LABELS, isOpenRun } from './features/lesson-engine/run-model.js'
import type { CurriculumLessonSummary, LessonDefinition, LessonRunSummary } from './features/lesson-engine/types.js'

const statusEl = document.getElementById('le-status') as HTMLParagraphElement
const viewEl = document.getElementById('le-view') as HTMLDivElement

const LESSON_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function runHref(runId: string): string {
  // Keep a development classroom provider (?classroom=…) across navigation.
  const classroom = new URLSearchParams(location.search).get('classroom')
  const suffix = classroom ? `&classroom=${encodeURIComponent(classroom)}` : ''
  return `lesson-engine.html?run=${encodeURIComponent(runId)}${suffix}`
}

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

function renderOpenRuns(runs: LessonRunSummary[]): HTMLElement | null {
  const open = runs.filter(run => isOpenRun(run.status))
  if (open.length === 0) return null
  const section = document.createElement('section')
  section.className = 'le-open-runs'
  section.setAttribute('aria-labelledby', 'le-open-runs-title')
  const h2 = document.createElement('h2')
  h2.id = 'le-open-runs-title'
  h2.textContent = 'Незавершені уроки'
  const list = document.createElement('ul')
  list.className = 'le-lesson-list'
  for (const run of open) {
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.className = 'le-lesson-card'
    a.href = runHref(run.id)
    const title = document.createElement('span')
    title.className = 'le-lesson-card__title'
    title.textContent = `${run.lessonTitle.uk} — ${run.className}`
    const meta = document.createElement('span')
    meta.className = 'le-lesson-card__meta'
    meta.textContent = `${RUN_STATUS_LABELS[run.status]} · крок ${run.currentStepIndex + 1} з ${run.stepCount}`
    a.append(title, meta)
    li.append(a)
    list.append(li)
  }
  section.append(h2, list)
  return section
}

function renderLessonList(lessons: CurriculumLessonSummary[], runs: LessonRunSummary[]) {
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
  const openRuns = renderOpenRuns(runs)
  if (openRuns) section.insertBefore(openRuns, h1.nextSibling)
  viewEl.replaceChildren(section)
}

/** Class picker + "prepare" for a lesson; an open run of this lesson offers resume instead. */
async function renderRunLauncher(lesson: LessonDefinition): Promise<HTMLElement> {
  const panel = document.createElement('section')
  panel.className = 'le-launcher'
  panel.setAttribute('aria-label', 'Провести урок з класом')
  const [{ classes }, { runs }] = await Promise.all([getTeacherClasses(), listLessonRuns()])

  for (const run of runs.filter(item => item.lessonId === lesson.id && isOpenRun(item.status))) {
    const resume = document.createElement('a')
    resume.className = 'btn btn--teacher'
    resume.href = runHref(run.id)
    resume.textContent = `Продовжити урок: ${run.className}`
    panel.append(resume)
  }

  if (classes.length === 0) {
    const empty = document.createElement('p')
    empty.append('Щоб провести урок, спершу створіть клас у ')
    const link = document.createElement('a')
    link.href = 'teacher.html'
    link.textContent = 'кабінеті вчителя'
    empty.append(link, '.')
    panel.append(empty)
    return panel
  }

  const label = document.createElement('label')
  label.htmlFor = 'le-class-select'
  label.textContent = 'Клас'
  const select = document.createElement('select')
  select.id = 'le-class-select'
  select.className = 'le-launcher__select'
  for (const cls of classes) {
    const option = document.createElement('option')
    option.value = cls.id
    option.textContent = cls.name
    select.append(option)
  }
  const prepare = document.createElement('button')
  prepare.type = 'button'
  prepare.className = 'btn btn--teacher'
  prepare.textContent = 'Підготувати урок'
  const error = document.createElement('p')
  error.className = 'le-launcher__error'
  error.setAttribute('role', 'alert')
  prepare.addEventListener('click', async () => {
    prepare.disabled = true
    error.textContent = ''
    try {
      const view = await createLessonRun(select.value, lesson.id)
      location.href = runHref(view.run.id)
    } catch (err) {
      const runId = (err as ApiError).body?.runId
      if ((err as ApiError).status === 409 && typeof runId === 'string') {
        location.href = runHref(runId)
        return
      }
      error.textContent = (err as Error).message
      prepare.disabled = false
    }
  })
  panel.append(label, select, prepare, error)
  return panel
}

function renderLesson(lesson: LessonDefinition) {
  document.title = `${lesson.title.uk} — Розумко`
  const toolbar = document.createElement('div')
  toolbar.className = 'le-toolbar'
  const back = document.createElement('a')
  back.href = 'lesson-engine.html'
  back.className = 'le-toolbar__back'
  back.textContent = '← Усі уроки'
  const check: BoardActivityDeps['check'] = (instanceId, answer) => checkCurriculumActivity(lesson.id, instanceId, answer)
  const board = mountBoardWindow(lesson, { check })
  toolbar.append(back, board.element)

  // With the projector open, "show from here" moves the class screen; without
  // it, the slides open full screen on this page.
  const start = (blockId: string) => {
    if (board.follow(blockId)) return
    const handle = openPresentation(lesson, { startBlockId: blockId, activities: { check } })
    if (!handle) setStatus('У цьому уроці немає слайдів для дошки.')
  }
  viewEl.replaceChildren(toolbar, renderLessonDocument(lesson, { onPresentFrom: start }))
  renderRunLauncher(lesson)
    .then(panel => toolbar.after(panel))
    .catch(() => { /* the plan stays usable without the run launcher */ })
}

async function openReport(runId: string) {
  const report = await getLessonRunReport(runId)
  document.title = `Звіт: ${report.run.lessonTitle.uk} — ${report.run.className}`
  clearStatus()
  viewEl.replaceChildren(renderLessonReport(report, runHref(runId)))
}

async function openRun(runId: string) {
  const view = await getLessonRun(runId)
  document.title = `${view.lesson.title.uk} — урок з класом ${view.run.className}`
  clearStatus()
  const back = document.createElement('a')
  back.href = 'lesson-engine.html'
  back.className = 'le-toolbar__back'
  back.textContent = '← Усі уроки'
  const toolbar = document.createElement('div')
  toolbar.className = 'le-toolbar'
  toolbar.append(back)
  const consoleRoot = document.createElement('div')
  consoleRoot.className = 'le-console'
  viewEl.replaceChildren(toolbar, consoleRoot)
  const provider = resolveClassroomControlProvider(location)
  // Development aid: tests and demos inspect what the fake "opened".
  if (provider) (window as unknown as { __rozumkoClassroom?: ClassroomControlProvider }).__rozumkoClassroom = provider
  mountRunConsole(consoleRoot, view, {
    act: action => lessonRunAction(runId, action),
    setStep: stepIndex => setLessonRunStep(runId, stepIndex),
    getRun: () => getLessonRun(runId),
    join: {
      openJoin: () => openLessonRunJoin(runId),
      closeJoin: () => closeLessonRunJoin(runId),
      listDevices: () => listLessonRunDevices(runId),
      mapDevice: (deviceId, studentId) => mapLessonRunDevice(runId, deviceId, studentId),
      revokeDevice: deviceId => revokeLessonRunDevice(runId, deviceId),
      classLink: {
        get: () => getClassLessonLink(view.run.classId),
        setEnabled: enabled => setClassLessonLink(view.run.classId, enabled),
        rotate: () => rotateClassLessonLink(view.run.classId),
        forgetSeats: () => forgetClassLessonSeats(view.run.classId),
        confirm: message => window.confirm(message),
        copy: text => navigator.clipboard.writeText(text),
      },
    },
    remote: {
      getConnection: getClassroomRemoteConnection,
      connect: connectClassroomRemote,
      disconnect: disconnectClassroomRemote,
      getStatus: () => getRunClassroomRemote(runId),
      open: () => openRunOnClassroomRemote(runId),
      confirm: message => window.confirm(message),
    },
    computers: provider ? {
      provider,
      getAssignments: () => getDeviceAssignments(view.run.classId),
      saveAssignments: assignments => saveDeviceAssignments(view.run.classId, assignments),
      launch: remoteDeviceIds => launchLessonRun(runId, remoteDeviceIds),
    } : undefined,
    live: {
      getLive: () => getLessonRunLive(runId),
      dispatch: blockId => dispatchLessonActivity(runId, blockId),
      closeDispatch: () => closeLessonActivity(runId),
    },
    check: (instanceId, answer) => checkCurriculumActivity(view.run.lessonId, instanceId, answer),
  })
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

    const params = new URLSearchParams(location.search)
    const runId = params.get('run')
    if (runId !== null) {
      if (!RUN_ID_RE.test(runId)) {
        setStatus('Урок не знайдено.', { href: 'lesson-engine.html', label: 'До списку уроків' })
        return
      }
      if (params.get('view') === 'report') await openReport(runId)
      else await openRun(runId)
      return
    }

    const lessonId = params.get('lesson')
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

    // Open runs are a convenience on the list; the list must not fail with them.
    const [{ lessons }, { runs }] = await Promise.all([
      getCurriculumLessons(),
      listLessonRuns().catch(() => ({ runs: [] as LessonRunSummary[] })),
    ])
    clearStatus()
    renderLessonList(lessons, runs)
  } catch (err) {
    const status = (err as ApiError).status
    if (status === 404) setStatus('Урок не знайдено.', { href: 'lesson-engine.html', label: 'До списку уроків' })
    else setStatus((err as Error).message || 'Не вдалося завантажити уроки.', { href: 'teacher.html', label: 'До кабінету' })
  }
}

void main()
