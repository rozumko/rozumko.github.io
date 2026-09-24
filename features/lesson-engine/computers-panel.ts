// Lab computers panel in the run console (stage I). Shown only when a
// classroom control provider is available. The teacher assigns computers to
// students once per class, then opens the lesson on all of them at once; each
// computer reports its own result, and one failure never blocks the rest.

import type { DeviceAssignment, LessonLaunchPlan } from '../api/client.js'
import { absoluteLaunchUrl, type ClassroomControlProvider, type RemoteDevice } from './classroom-control.js'
import { isOpenRun } from './run-model.js'
import type { LessonRunView } from './types.js'

export interface ComputersPanelDeps {
  provider: ClassroomControlProvider
  getAssignments(): Promise<{ assignments: DeviceAssignment[] }>
  saveAssignments(assignments: DeviceAssignment[]): Promise<unknown>
  launch(remoteDeviceIds: string[]): Promise<LessonLaunchPlan>
}

export interface ComputersPanel {
  element: HTMLElement
  update(view: LessonRunView): void
}

const SKIP_REASONS: Readonly<Record<LessonLaunchPlan['skipped'][number]['reason'], string>> = {
  'unassigned': 'не прив’язаний до учня',
  'not-in-roster': 'учня немає в цьому уроці',
  'full': 'забагато пристроїв',
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, className = 'le-board__action'): HTMLButtonElement {
  const b = el('button', className, label)
  b.type = 'button'
  return b
}

export function mountComputersPanel(initial: LessonRunView, deps: ComputersPanelDeps): ComputersPanel {
  let view = initial
  let devices: RemoteDevice[] = []
  let assignments = new Map<string, string>()

  const root = el('section', 'le-live le-computers')
  root.setAttribute('aria-labelledby', 'le-computers-title')
  const title = el('h2', 'le-join__title', `Комп’ютери класу · ${deps.provider.label}`)
  title.id = 'le-computers-title'
  const list = el('ul', 'le-join__device-list')
  const actions = el('div', 'le-join__actions')
  const results = el('ul', 'le-computers__results')
  results.setAttribute('aria-label', 'Результат відкриття')
  const message = el('p', 'le-join__message')
  message.setAttribute('role', 'status')
  root.append(title, list, actions, message, results)

  const save = button('Зберегти прив’язку')
  const launch = button('Відкрити урок на комп’ютерах', 'le-board__action le-board__action--primary')
  actions.append(save, launch)

  function renderDevices() {
    list.replaceChildren()
    const roster = view.students.filter(student => student.label !== null && student.classStudentId !== null)
    for (const device of devices) {
      const item = el('li', 'le-join__device')
      const selectId = `le-computer-${device.id}`
      const label = el('label', 'le-join__device-number', device.id)
      label.htmlFor = selectId
      const select = el('select', 'le-launcher__select')
      select.id = selectId
      select.dataset.device = device.id
      const none = el('option', undefined, '— нікому —')
      none.value = ''
      select.append(none)
      for (const student of roster) {
        const option = el('option', undefined, student.label!)
        option.value = student.classStudentId!
        select.append(option)
      }
      select.value = assignments.get(device.id) ?? ''
      select.addEventListener('change', () => {
        if (select.value) {
          // One computer per student: moving a student frees their old computer.
          for (const [other, studentId] of assignments) if (studentId === select.value && other !== device.id) assignments.delete(other)
          assignments.set(device.id, select.value)
        } else {
          assignments.delete(device.id)
        }
        renderDevices()
        list.querySelector<HTMLSelectElement>(`#${CSS.escape(selectId)}`)?.focus()
      })
      item.append(label, select, el('span', 'le-live__presence', device.online ? 'у мережі' : 'не в мережі'))
      list.append(item)
    }
  }

  save.addEventListener('click', async () => {
    message.textContent = ''
    try {
      await deps.saveAssignments([...assignments].map(([remoteDeviceId, classStudentId]) => ({ remoteDeviceId, classStudentId })))
      message.textContent = 'Прив’язку збережено.'
    } catch (err) {
      message.textContent = (err as Error).message
    }
  })

  launch.addEventListener('click', async () => {
    message.textContent = ''
    results.replaceChildren()
    launch.disabled = true
    try {
      // Save first so the server launches exactly what the teacher sees.
      await deps.saveAssignments([...assignments].map(([remoteDeviceId, classStudentId]) => ({ remoteDeviceId, classStudentId })))
      const targets = devices.filter(device => device.online && assignments.has(device.id)).map(device => device.id)
      if (targets.length === 0) {
        message.textContent = 'Немає прив’язаних комп’ютерів у мережі.'
        return
      }
      const plan = await deps.launch(targets)
      const acks = await deps.provider.launchUrls(plan.launches.map(l => ({ deviceId: l.remoteDeviceId, url: absoluteLaunchUrl(l.url, location.href) })))
      for (const ack of acks) {
        results.append(el('li', ack.ok ? 'le-computers__ok' : 'le-computers__fail', ack.ok ? `✓ ${ack.deviceId}: відкрито` : `✗ ${ack.deviceId}: ${ack.error ?? 'помилка'}`))
      }
      for (const skip of plan.skipped) results.append(el('li', 'le-computers__fail', `– ${skip.remoteDeviceId}: ${SKIP_REASONS[skip.reason]}`))
      const opened = acks.filter(a => a.ok).length
      message.textContent = `Відкрито на ${opened} з ${targets.length} комп’ютерів.`
    } catch (err) {
      message.textContent = (err as Error).message
    } finally {
      launch.disabled = false
    }
  })

  async function load() {
    try {
      const [listed, saved] = await Promise.all([deps.provider.listDevices(), deps.getAssignments()])
      devices = listed
      assignments = new Map(saved.assignments.map(a => [a.remoteDeviceId, a.classStudentId]))
      renderDevices()
    } catch (err) {
      message.textContent = (err as Error).message || 'Не вдалося отримати список комп’ютерів.'
    }
  }

  function update(next: LessonRunView) {
    view = next
    root.hidden = !isOpenRun(view.run.status)
  }

  update(initial)
  void load()
  return { element: root, update }
}
