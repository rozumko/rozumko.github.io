// Student side of Lesson Engine web join (stage G1). No account and no name:
// the child types the teacher's code, gets a pairing number, and waits for the
// teacher to say who they are. The device token lives in sessionStorage only.
// Answers go through an offline outbox (stage J): saved on the device first,
// then sent — again on reconnect, on each poll and on the next page load.
// A class link (#class=…, e.g. opened by Classroom Remote) joins whatever
// lesson the class has open, waits when none is, and rejoins the next one.
// A random seat secret in localStorage lets the server remember who sat here.

import './frontend-security.js'
import { exchangeLessonLaunch, getLessonDeviceState, joinLessonByClassLink, joinLessonRun, submitLessonAttempt, type ApiError } from './features/api/client.js'
import { renderStudentTask, type StudentTaskView } from './features/lesson-engine/student-task.js'
import { renderStudentPractice } from './features/lesson-engine/practice-view.js'
import { renderStudentCanvas } from './features/lesson-engine/canvas-view.js'
import { createAttemptOutbox } from './features/lesson-engine/attempt-outbox.js'
import { indexedDbOutboxStore } from './features/lesson-engine/outbox-idb.js'
import { formatJoinCode, parseClassLinkFragment, seatSecretFrom } from './features/lesson-engine/run-model.js'
import type { LessonAttemptResponse, LessonDeviceJoin, LessonDeviceState } from './features/lesson-engine/types.js'

const STORAGE_KEY = 'rozumko_lesson_device'
const SEAT_KEY = 'rozumko_lesson_seat'
// Fast enough that a sent task appears within a couple of seconds.
const POLL_MS = 2000
// A laptop on a class link waiting for the lesson to begin.
const CLASS_WAIT_MS = 15_000

const joinSection = document.getElementById('lj-join') as HTMLElement
const waitSection = document.getElementById('lj-wait') as HTMLElement
const form = document.getElementById('lj-form') as HTMLFormElement
const input = document.getElementById('lj-code') as HTMLInputElement
const errorEl = document.getElementById('lj-error') as HTMLParagraphElement
const lessonEl = document.getElementById('lj-lesson') as HTMLParagraphElement
const numberEl = document.getElementById('lj-number') as HTMLParagraphElement
const statusEl = document.getElementById('lj-status') as HTMLParagraphElement
const noticeEl = document.getElementById('lj-notice') as HTMLParagraphElement
const taskHost = document.getElementById('lj-task-host') as HTMLDivElement

type StoredDevice = Pick<LessonDeviceJoin, 'deviceId' | 'deviceToken' | 'pairingNumber'>

let timer: number | null = null
let classTimer: number | null = null
const classLink = parseClassLinkFragment(location.hash)
// The task on screen; re-rendered only when the teacher sends a different one,
// so a child's half-made choice survives each poll.
let shownDispatchId: string | null = null
let shownMaterialId: string | null = null
let taskView: StudentTaskView | null = null

function clearTask() {
  taskView?.leave()
  taskView = null
  shownDispatchId = null
  shownMaterialId = null
  taskHost.replaceChildren()
  waitSection.classList.remove('lj-card--task')
}

function readDevice(): StoredDevice | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as StoredDevice : null
    return parsed && typeof parsed.deviceId === 'string' && typeof parsed.deviceToken === 'string' ? parsed : null
  } catch {
    return null
  }
}

function storeDevice(device: StoredDevice | null) {
  try {
    if (device) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(device))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* sessionStorage unavailable: the child re-joins after a reload */ }
}

const outbox = createAttemptOutbox<LessonAttemptResponse>({
  store: indexedDbOutboxStore(),
  now: () => Date.now(),
  send: item => {
    const device = readDevice()
    // Only the device that answered may send it; its token is never stored with the answer.
    if (!device || device.deviceId !== item.deviceId) {
      return Promise.reject(Object.assign(new Error('Цей пристрій уже не в уроці.'), { status: 401 }))
    }
    return submitLessonAttempt({
      deviceId: device.deviceId,
      deviceToken: device.deviceToken,
      dispatchId: item.dispatchId,
      clientAttemptId: item.clientAttemptId,
      ...(item.payload as Pick<Parameters<typeof submitLessonAttempt>[0], 'answer' | 'gameResult'>),
    })
  },
  onDelivered: (item, response) => {
    if (item.dispatchId === shownDispatchId) taskView?.delivered(response)
  },
  onRejected: (item, message) => {
    noticeEl.textContent = `Відповідь не зараховано: ${message}`
    // Show the task as the server now sees it on the next poll.
    if (item.dispatchId === shownDispatchId) shownDispatchId = null
  },
})

window.addEventListener('online', () => void outbox.flush())

/**
 * This browser's seat: a random secret kept across lessons, so the teacher
 * assigns a child to this laptop once. No name or score is stored here.
 */
function readSeat(): string | null {
  try {
    let seat = localStorage.getItem(SEAT_KEY)
    if (!seat || !/^[A-Za-z0-9_-]{43}$/.test(seat)) {
      seat = seatSecretFrom(crypto.getRandomValues(new Uint8Array(32)))
      localStorage.setItem(SEAT_KEY, seat)
    }
    return seat
  } catch {
    return null // storage blocked: joins still work, the seat is just not remembered
  }
}

function stopClassWait() {
  if (classTimer !== null) window.clearTimeout(classTimer)
  classTimer = null
}

/** Class link: join the class's open lesson, or wait and ask again. */
function waitForClassLesson(status: string) {
  if (!classLink) return
  stopClassWait()
  joinSection.hidden = true
  waitSection.hidden = false
  waitSection.classList.add('lj-card--waiting')
  statusEl.textContent = status
  const attempt = async () => {
    classTimer = null
    try {
      const joined = await joinLessonByClassLink(classLink, readSeat())
      waitSection.classList.remove('lj-card--waiting')
      const device = { deviceId: joined.deviceId, deviceToken: joined.deviceToken, pairingNumber: joined.pairingNumber }
      storeDevice(device)
      startPolling(device)
    } catch (err) {
      // A revoked seat stays out of this lesson; the code screen remains.
      if ((err as ApiError).code === 'LINK_INVALID' || (err as ApiError).code === 'DEVICE_REVOKED') {
        waitSection.classList.remove('lj-card--waiting')
        showJoin((err as Error).message || 'Посилання класу більше не діє.')
        return
      }
      // No lesson yet, or a network blip: ask again soon.
      statusEl.textContent = (err as ApiError).code === 'NO_OPEN_RUN' ? status : 'Немає зв’язку. Пробуємо ще раз…'
      classTimer = window.setTimeout(() => void attempt(), CLASS_WAIT_MS)
    }
  }
  void attempt()
}

function showJoin(message = '') {
  clearTask()
  if (timer !== null) window.clearInterval(timer)
  timer = null
  waitSection.hidden = true
  joinSection.hidden = false
  errorEl.textContent = message
}

function renderState(device: StoredDevice, state: LessonDeviceState) {
  joinSection.hidden = true
  waitSection.hidden = false
  lessonEl.textContent = state.lessonTitle.uk
  numberEl.textContent = `№ ${state.pairingNumber}`
  if (state.runStatus === 'finished' || state.runStatus === 'cancelled') {
    clearTask()
    statusEl.textContent = 'Урок завершено. Дякуємо!'
    if (timer !== null) window.clearInterval(timer)
    timer = null
    storeDevice(null)
    void outbox.dropDevice(device.deviceId)
    // On a class link the laptop stays ready for this class's next lesson.
    if (classLink) waitForClassLesson('Урок завершено. Дякуємо!')
    return
  }
  if (!state.mapped || !state.studentLabel) {
    clearTask()
    statusEl.textContent = 'Покажи свій номер учителю і чекай.'
    return
  }
  if (state.runStatus === 'paused') {
    clearTask()
    statusEl.textContent = 'Пауза. Слухай учителя.'
    return
  }
  if (!state.task) {
    if (state.material) {
      statusEl.textContent = state.material.kind === 'canvas'
        ? `${state.studentLabel}, матеріал уроку:`
        : `${state.studentLabel}, практична робота:`
      if (shownMaterialId === state.material.blockId) return
      clearTask()
      shownMaterialId = state.material.blockId
      waitSection.classList.add('lj-card--task')
      if (state.material.kind === 'canvas') renderStudentCanvas(taskHost, state.material)
      else renderStudentPractice(taskHost, state.material)
      return
    }
    clearTask()
    statusEl.textContent = `Привіт, ${state.studentLabel}! Чекай на завдання від учителя.`
    return
  }
  statusEl.textContent = `${state.studentLabel}, твоє завдання:`
  if (state.task.dispatchId === shownDispatchId) return
  const previous = shownDispatchId
  clearTask()
  if (previous !== null) noticeEl.textContent = ''
  shownDispatchId = state.task.dispatchId
  waitSection.classList.add('lj-card--task')
  const dispatchId = state.task.dispatchId
  taskView = renderStudentTask(taskHost, state.task, state.grade, {
    submit: ({ clientAttemptId, ...payload }) => outbox.submit({ clientAttemptId, deviceId: device.deviceId, dispatchId, payload }),
    newAttemptId: () => crypto.randomUUID(),
    queued: outbox.hasPending(device.deviceId, dispatchId),
  })
}

async function refresh(device: StoredDevice) {
  // Waiting answers go first; the flush is single-flight and never blocks the poll.
  void outbox.flush()
  try {
    renderState(device, await getLessonDeviceState(device.deviceId, device.deviceToken))
  } catch (err) {
    if ((err as ApiError).status === 401 || (err as ApiError).status === 404) {
      void outbox.dropDevice(device.deviceId)
      storeDevice(null)
      if (classLink) {
        if (timer !== null) window.clearInterval(timer)
        timer = null
        clearTask()
        waitForClassLesson('Приєднуємося до уроку…')
      } else {
        showJoin('Приєднайся до уроку ще раз.')
      }
    }
    // Other errors are transient: keep the screen and retry on the next poll.
  }
}

function startPolling(device: StoredDevice) {
  // The stored outbox must be loaded before the first task renders its state.
  void outbox.ready.then(() => refresh(device))
  if (timer !== null) window.clearInterval(timer)
  timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refresh(device)
  }, POLL_MS)
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  const code = input.value.replace(/\D/g, '')
  if (code.length !== 6) {
    errorEl.textContent = 'Введи 6 цифр коду.'
    input.focus()
    return
  }
  const submit = form.querySelector('button') as HTMLButtonElement
  submit.disabled = true
  errorEl.textContent = ''
  try {
    const joined = await joinLessonRun(code, readSeat())
    const device = { deviceId: joined.deviceId, deviceToken: joined.deviceToken, pairingNumber: joined.pairingNumber }
    storeDevice(device)
    stopClassWait()
    // Keep the code out of the address bar and history once used.
    history.replaceState(null, '', location.pathname)
    startPolling(device)
  } catch (err) {
    errorEl.textContent = (err as Error).message || 'Не вдалося приєднатися.'
  } finally {
    submit.disabled = false
  }
})

input.addEventListener('input', () => {
  const digits = input.value.replace(/\D/g, '').slice(0, 6)
  const formatted = digits.length > 3 ? formatJoinCode(digits.padEnd(6, ' ')).trimEnd() : digits
  if (input.value !== formatted) input.value = formatted
})

/** A lab computer opened by the teacher: #launch=<single-use token>. */
async function launchFromFragment(token: string) {
  // Drop the token from the address bar and history before anything else.
  history.replaceState(null, '', location.pathname)
  try {
    const joined = await exchangeLessonLaunch(token)
    const device = { deviceId: joined.deviceId, deviceToken: joined.deviceToken, pairingNumber: joined.pairingNumber }
    storeDevice(device)
    startPolling(device)
  } catch (err) {
    showJoin((err as Error).message || 'Не вдалося відкрити урок.')
  }
}

const launchToken = new URLSearchParams(location.hash.slice(1)).get('launch')
const stored = readDevice()
if (launchToken) {
  void launchFromFragment(launchToken)
} else if (stored) {
  startPolling(stored)
} else if (classLink) {
  // The class link stays in the address bar: reloading the Lesson Tab rejoins.
  waitForClassLesson('Чекай: урок ще не почався.')
} else {
  const fromLink = new URLSearchParams(location.search).get('code')?.replace(/\D/g, '').slice(0, 6) ?? ''
  if (fromLink) input.value = fromLink.length === 6 ? formatJoinCode(fromLink) : fromLink
  input.focus()
}
