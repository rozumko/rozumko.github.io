// Class link and remembered seats, in the run console's join panel. One
// stable link per class, saved once (e.g. as a Classroom Remote quick link):
// laptops opened on it join whatever lesson this class has open. Seats: when
// the teacher assigns a device, the browser's seat is remembered, and next
// lesson that laptop is matched to the same child by itself.

import type { ClassLessonLinkState } from '../api/client.js'

export interface ClassLinkDeps {
  get(): Promise<ClassLessonLinkState>
  setEnabled(enabled: boolean): Promise<ClassLessonLinkState>
  rotate(): Promise<ClassLessonLinkState>
  forgetSeats(): Promise<ClassLessonLinkState>
  /** Asks before an action that breaks copies of the link; injectable for tests. */
  confirm(message: string): boolean
  copy(text: string): Promise<void>
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

/** "Запам'ятовано місць: 3" in words a teacher reads at a glance. */
export function seatsLine(count: number): string {
  return count === 0
    ? 'Місця ще не запам’ятовано: призначте пристрої учням, і наступного уроку вони підхопляться самі.'
    : `Запам’ятовано місць: ${count}. На цих ноутбуках учні підхопляться самі.`
}

export function mountClassLinkPanel(deps: ClassLinkDeps): HTMLElement {
  const root = el('details', 'le-classlink')
  const summary = el('summary', 'le-classlink__summary', 'Посилання класу (Classroom Remote)')
  const body = el('div', 'le-classlink__body')
  const message = el('p', 'le-classlink__message')
  message.setAttribute('role', 'status')
  root.append(summary, body, message)
  let state: ClassLessonLinkState | null = null
  let loaded = false

  async function act(task: () => Promise<ClassLessonLinkState>, done = '') {
    message.textContent = ''
    try {
      state = await task()
      render()
      message.textContent = done
    } catch (err) {
      message.textContent = (err as Error).message || 'Не вдалося виконати дію.'
    }
  }

  function render() {
    if (!state) return
    const hint = el('p', 'le-classlink__hint',
      'Одне постійне посилання для цього класу. Збережіть його один раз у Classroom Remote — ноутбуки, відкриті на ньому, самі приєднуються до кожного уроку цього класу.')
    const nodes: HTMLElement[] = [hint]
    const link = state.link
    if (!link?.enabled || !link.path) {
      const enable = button('Увімкнути посилання класу', 'le-board__action le-board__action--primary')
      enable.addEventListener('click', () => void act(() => deps.setEnabled(true)))
      nodes.push(enable)
    } else {
      const url = new URL(link.path, location.href).href
      const field = el('div', 'le-classlink__field')
      const label = el('label', 'le-classlink__label', 'Посилання класу')
      label.htmlFor = 'le-classlink-url'
      const input = el('input', 'le-classlink__url')
      input.id = 'le-classlink-url'
      input.readOnly = true
      input.value = url
      input.addEventListener('focus', () => input.select())
      field.append(label, input)
      const actions = el('div', 'le-join__actions')
      const copy = button('Копіювати')
      copy.addEventListener('click', () => {
        void deps.copy(url).then(
          () => { message.textContent = 'Посилання скопійовано.' },
          () => { input.focus(); message.textContent = 'Виділіть посилання і скопіюйте вручну.' },
        )
      })
      const rotate = button('Нове посилання')
      rotate.addEventListener('click', () => {
        if (!deps.confirm('Старе посилання перестане працювати на всіх ноутбуках. Потім оновіть його в Classroom Remote. Продовжити?')) return
        void act(deps.rotate, 'Створено нове посилання. Оновіть його в Classroom Remote.')
      })
      const disable = button('Вимкнути')
      disable.addEventListener('click', () => {
        if (!deps.confirm('Вимкнути посилання класу? Ноутбуки з ним більше не приєднуватимуться.')) return
        void act(() => deps.setEnabled(false), 'Посилання класу вимкнено.')
      })
      actions.append(copy, rotate, disable)
      nodes.push(field, actions)
    }
    const seats = el('p', 'le-classlink__seats', seatsLine(state.rememberedSeats))
    nodes.push(seats)
    if (state.rememberedSeats > 0) {
      const forget = button('Забути місця')
      forget.addEventListener('click', () => {
        if (!deps.confirm('Забути, хто за яким ноутбуком сидить? Наступного уроку пристрої доведеться призначити заново.')) return
        void act(deps.forgetSeats, 'Місця забуто.')
      })
      nodes.push(forget)
    }
    body.replaceChildren(...nodes)
  }

  // Loaded on first open: most lessons never need it.
  root.addEventListener('toggle', () => {
    if (!root.open || loaded) return
    loaded = true
    body.replaceChildren(el('p', undefined, 'Завантаження…'))
    void act(deps.get).then(() => {
      // A failed first load can be retried by closing and opening again.
      if (!state) {
        loaded = false
        body.replaceChildren()
      }
    })
  })
  return root
}
