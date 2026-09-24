// The room's laptops, from the run console (Classroom Remote integration). The
// teacher connects once with an integration key made in Classroom Remote, then
// opens this class's link on every laptop with one button and watches them
// sync. Nothing about children goes to Classroom Remote: only the class link.

import type { ClassroomRemoteConnection, ClassroomRemoteRoomStatus } from '../api/client.js'

export interface ClassroomRemotePanelDeps {
  getConnection(): Promise<ClassroomRemoteConnection>
  connect(key: string): Promise<ClassroomRemoteConnection>
  disconnect(): Promise<ClassroomRemoteConnection>
  getStatus(): Promise<ClassroomRemoteRoomStatus>
  open(): Promise<{ revision: number }>
  confirm(message: string): boolean
}

export interface ClassroomRemotePanel {
  element: HTMLElement
  /** Stops polling when the lesson closes or the page leaves. */
  setActive(active: boolean): void
}

const POLL_MS = 10_000
const OPENING = 'Урок відкривається на ноутбуках…'
const KEY_RE = /^crk_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/

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

/** "12 з 14 онлайн · 11 відкрили урок" — the words a teacher glances at. */
export function roomSummaryLine(summary: { total: number; online: number; synced: number }, showingThisClass: boolean): string {
  if (summary.total === 0) return 'У кабінеті ще немає підключених ноутбуків.'
  const online = `${summary.online} з ${summary.total} онлайн`
  return showingThisClass ? `${online} · ${summary.synced} відкрили урок` : `${online} · урок ще не відкрито`
}

export function mountClassroomRemotePanel(deps: ClassroomRemotePanelDeps): ClassroomRemotePanel {
  const root = el('section', 'le-remote')
  root.setAttribute('aria-labelledby', 'le-remote-title')
  root.hidden = true
  const title = el('h2', 'le-join__title', 'Ноутбуки класу')
  title.id = 'le-remote-title'
  const body = el('div', 'le-remote__body')
  const message = el('p', 'le-classlink__message')
  message.setAttribute('role', 'status')
  root.append(title, body, message)

  let connection: ClassroomRemoteConnection | null = null
  let active = true
  let timer: number | null = null
  let busy = false

  function stopPolling() {
    if (timer !== null) window.clearInterval(timer)
    timer = null
  }

  function renderConnect() {
    stopPolling()
    const form = el('form', 'le-remote__connect')
    form.noValidate = true
    const hint = el('p', 'le-classlink__hint',
      'Відкривайте урок на всіх ноутбуках кабінету прямо звідси. У Classroom Remote: «Налаштування» → «Ключі для сервісів» → створіть ключ для rozumko.com і вставте його нижче. Classroom Remote отримує лише посилання уроку — жодних імен учнів.')
    const label = el('label', 'le-classlink__label', 'Ключ інтеграції Classroom Remote')
    label.htmlFor = 'le-remote-key'
    const input = el('input', 'le-classlink__url')
    input.id = 'le-remote-key'
    input.type = 'password'
    input.autocomplete = 'off'
    input.spellcheck = false
    const submit = button('Підключити', 'le-board__action le-board__action--primary')
    submit.type = 'submit'
    form.append(hint, label, input, submit)
    form.addEventListener('submit', event => {
      event.preventDefault()
      const key = input.value.trim()
      if (!KEY_RE.test(key)) {
        message.textContent = 'Це не схоже на ключ Classroom Remote (він починається з crk_).'
        input.focus()
        return
      }
      void act(async () => {
        connection = await deps.connect(key)
        input.value = ''
        message.textContent = 'Classroom Remote підключено.'
        render()
      })
    })
    body.replaceChildren(form)
  }

  function renderRoom(status: ClassroomRemoteRoomStatus) {
    const room = el('p', 'le-remote__room', `Кабінет: ${status.roomName || connection?.roomName || '—'}`)
    const summary = el('p', 'le-remote__summary', roomSummaryLine(status.summary ?? { total: 0, online: 0, synced: 0 }, Boolean(status.showingThisClass)))
    const open = button(status.showingThisClass ? 'Відкрити урок ще раз' : 'Відкрити урок на ноутбуках', 'le-board__action le-board__action--primary')
    open.addEventListener('click', () => void act(async () => {
      await deps.open()
      message.textContent = OPENING
      await refresh()
    }))
    const list = el('ul', 'le-remote__devices')
    list.setAttribute('aria-label', 'Ноутбуки кабінету')
    for (const device of status.devices ?? []) {
      const state = !device.online ? 'офлайн' : status.showingThisClass && device.synced ? 'урок відкрито ✓' : 'онлайн'
      const item = el('li', `le-remote__device le-remote__device--${!device.online ? 'offline' : device.synced && status.showingThisClass ? 'synced' : 'online'}`, `${device.deviceName}: ${state}`)
      list.append(item)
    }
    const disconnect = button('Відключити Classroom Remote', 'le-join__revoke')
    disconnect.addEventListener('click', () => {
      if (!deps.confirm('Відключити Classroom Remote від Розумка? Ключ також варто відкликати в Classroom Remote.')) return
      void act(async () => {
        connection = await deps.disconnect()
        message.textContent = 'Classroom Remote відключено.'
        render()
      })
    })
    body.replaceChildren(room, summary, open, list, disconnect)
  }

  async function act(task: () => Promise<void>) {
    if (busy) return
    busy = true
    message.textContent = ''
    try {
      await task()
    } catch (err) {
      message.textContent = (err as Error).message || 'Не вдалося виконати дію.'
    } finally {
      busy = false
    }
  }

  async function refresh() {
    if (!active || !connection?.connected) return
    try {
      const status = await deps.getStatus()
      if (!status.connected) {
        connection = { ...connection, connected: false }
        render()
        return
      }
      renderRoom(status)
      if (status.showingThisClass && status.summary && status.summary.synced === status.summary.online) {
        if (message.textContent === OPENING) message.textContent = ''
      }
    } catch (err) {
      message.textContent = (err as Error).message || 'Classroom Remote зараз недоступний.'
    }
  }

  function render() {
    if (!connection?.configured) {
      root.hidden = true
      stopPolling()
      return
    }
    root.hidden = false
    if (!connection.connected) {
      renderConnect()
      return
    }
    body.replaceChildren(el('p', undefined, 'Завантаження…'))
    void refresh()
    stopPolling()
    timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
  }

  void deps.getConnection().then(
    state => { connection = state; if (active) render() },
    () => { root.hidden = true },
  )

  return {
    element: root,
    setActive(next) {
      // Called on every console render: act only on a change.
      if (next === active) return
      active = next
      if (!next) {
        stopPolling()
        root.hidden = true
      } else if (connection) {
        render()
      }
    },
  }
}
