// The lesson editor's activity dialog: one activity set up in three steps
// ("what the child does", "what we check", "where it shows") instead of one
// long form. It edits the block in place; the lesson editor owns saving,
// the outcome directory and the generic fields it passes in through the host.
// Rules live in curriculum-model.ts.

import type { ActivityMechanic, ActivityTelemetry } from '../lesson-engine/types.js'
import { createFocusTrap } from '../../utils/focus-trap.js'
import {
  CLASSIFY_LIMITS,
  EDITOR_MECHANICS,
  MIN_ITEMS_PER_OUTCOME,
  activityReadiness,
  addClassifyCategory,
  addClassifyItem,
  cardsLabel,
  isRecord,
  itemCountsFor,
  moveClassifyItem,
  outcomeItemChoices,
  removeClassifyCategory,
  removeClassifyItem,
  setActivityPurpose,
  setOnBoard,
  setOnDevices,
  toggleItemOutcome,
  type EditableBlock,
  type EditableLesson,
  type EditableOutcomeLink,
  type Json,
} from './curriculum-model.js'

export interface ActivityDialogHost {
  lesson: EditableLesson
  block: EditableBlock
  mechanicLabels: Readonly<Record<ActivityMechanic, string>>
  outcomeCode(outcomeId: string): string
  outcomeTitle(outcomeId: string): string
  /** The directory search that links an outcome to this activity. */
  outcomePicker(onPick: (outcomeId: string) => void): HTMLElement
  addOutcome(outcomeId: string): void
  removeOutcome(outcomeId: string): void
  /** Asks, then swaps the mechanic's template in; calls `done` only if it did. */
  switchMechanic(mechanic: ActivityMechanic, done: () => void): void
  /** Step 1 for mechanics without their own layout yet (the classic form). */
  classicForm(): HTMLElement
  contentFields(): HTMLElement
  slideFields(): HTMLElement | null
  jsonFields(): HTMLElement
  /** A value changed in place. */
  touched(): void
  /** A structural change: the editor behind the dialog is rebuilt. */
  changed(): void
  closed(): void
}

type Step = 'task' | 'check' | 'show'

const STEPS: readonly { id: Step; title: string }[] = [
  { id: 'task', title: 'Що робить учень' },
  { id: 'check', title: 'Що перевіряємо' },
  { id: 'show', title: 'Показ' },
]

const MECHANIC_HINTS: Readonly<Record<ActivityMechanic, string>> = {
  classify: 'Картки по групах',
  choice: 'Одна правильна відповідь',
  truefalse: 'Кілька тверджень: так чи ні',
  game: 'Готова гра платформи',
  external: 'Сайт-тренажер, без оцінки',
}

const PURPOSES: readonly { id: ActivityTelemetry; title: string; hint: string }[] = [
  { id: 'evidence', title: 'Для оцінки', hint: 'Одна спроба. Дитина не бачить, де помилилась. Результат іде у профіль учня і звіт уроку.' },
  { id: 'checkpoint', title: 'Перевірка на уроці', hint: 'Учитель бачить відповіді класу наживо. У профіль нічого не записується.' },
  { id: 'practice', title: 'Для тренування', hint: 'Кілька спроб, дитина бачить правильні відповіді. У профіль нічого не записується.' },
]

/** Tag colours per linked outcome, in link order (badge pairs are contrast-checked). */
const TAG_TONES = ['indigo', 'amber', 'sky', 'rose'] as const

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href]'

let idCounter = 0

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, label)
  b.type = 'button'
  b.addEventListener('click', onClick)
  return b
}

function text(value: unknown): string {
  return isRecord(value) && typeof value.uk === 'string' ? value.uk : ''
}

function setText(target: Json, key: string, value: string) {
  target[key] = { ...(isRecord(target[key]) ? target[key] : {}), uk: value }
}

function checkboxRow(label: string, hint: string, checked: boolean, disabled: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
  const row = el('label', 'ad-option')
  const input = el('input')
  input.type = 'checkbox'
  input.checked = checked
  input.disabled = disabled
  input.addEventListener('change', () => onChange(input.checked))
  const words = el('span', 'ad-option__text')
  words.append(el('span', 'ad-option__title', label), el('span', 'ad-option__hint', hint))
  row.append(input, words)
  return row
}

/** Opens the dialog; the returned `refresh` redraws it after an outside change. */
export function openActivityDialog(host: ActivityDialogHost, initial: Step = 'task'): { refresh: () => void; close: () => void } {
  const { block, lesson } = host
  let step: Step = initial

  const root = el('div', 'question-modal-overlay cl-overlay')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  const card = el('div', 'question-modal-card cl-overlay__card ad-card')
  const titleId = `ad-title-${++idCounter}`
  root.setAttribute('aria-labelledby', titleId)
  root.append(card)
  const opener = document.activeElement as HTMLElement | null
  let removeTrap: () => void = () => {}

  const close = () => {
    removeTrap()
    root.remove()
    host.closed()
    if (opener?.isConnected) opener.focus()
  }

  const structural = () => {
    host.changed()
    render()
  }

  function render() {
    // A redraw keeps keyboard users in place: refocus the control at the same position.
    const active = document.activeElement
    const focusIndex = active && card.contains(active) ? [...card.querySelectorAll(FOCUSABLE)].indexOf(active) : -1
    const scroll = card.scrollTop
    card.replaceChildren()
    const activity = block.activity
    if (!activity) {
      close()
      return
    }

    const head = el('div', 'ad-head')
    const heading = el('div', 'ad-head__text')
    const h = el('h3', 'question-modal-title', `Завдання: ${host.mechanicLabels[activity.mechanic]}`)
    h.id = titleId
    heading.append(h, el('p', 'question-item__meta', `ID ${activity.instanceId}`))
    head.append(heading, button('Готово', 'btn-adm-slate', close))
    card.append(head)

    const nav = el('div', 'ad-steps')
    nav.setAttribute('role', 'group')
    nav.setAttribute('aria-label', 'Кроки налаштування')
    STEPS.forEach((s, i) => {
      const b = button('', `ad-step${s.id === step ? ' ad-step--current' : ''}`, () => { step = s.id; render(); nav.querySelector<HTMLElement>('.ad-step--current')?.focus() })
      if (s.id === step) b.setAttribute('aria-current', 'step')
      // The number is visual; the name stays the step's title and aria-current marks the step.
      const n = el('span', 'ad-step__n', String(i + 1))
      n.setAttribute('aria-hidden', 'true')
      b.append(n, document.createTextNode(s.title))
      nav.append(b)
    })
    card.append(nav)

    const layout = el('div', 'ad-layout')
    const main = el('div', 'ad-main')
    const aside = el('div', 'ad-aside')
    if (step === 'task') renderTask(main, aside)
    else if (step === 'check') renderCheck(main)
    else renderShow(main)
    aside.append(renderReadiness())
    const index = STEPS.findIndex(s => s.id === step)
    const next = STEPS[index + 1]
    aside.append(next
      ? button(`Далі: ${next.title.toLowerCase()}`, 'btn-adm-violet ad-next', () => { step = next.id; render(); card.querySelector<HTMLElement>('.ad-step--current')?.focus() })
      : button('Готово', 'btn-adm-emerald ad-next', close))
    layout.append(main, aside)
    card.append(layout)

    card.scrollTop = scroll
    if (focusIndex >= 0) card.querySelectorAll<HTMLElement>(FOCUSABLE)[focusIndex]?.focus()
  }

  // ── Step 1: what the child does ────────────────────────────────────────────

  function renderTask(main: HTMLElement, aside: HTMLElement) {
    const activity = block.activity!
    const tiles = el('div', 'ad-tiles')
    tiles.setAttribute('role', 'group')
    tiles.setAttribute('aria-label', 'Тип завдання')
    for (const mechanic of EDITOR_MECHANICS) {
      const on = mechanic === activity.mechanic
      const tile = button('', `ad-tile${on ? ' ad-tile--on' : ''}`, () => {
        if (!on) host.switchMechanic(mechanic, render)
      })
      tile.setAttribute('aria-pressed', String(on))
      tile.append(el('span', 'ad-tile__title', host.mechanicLabels[mechanic]), el('span', 'ad-tile__hint', MECHANIC_HINTS[mechanic]))
      tiles.append(tile)
    }
    main.append(el('p', 'adm-label', 'Тип завдання'), tiles)

    if (activity.mechanic !== 'classify') {
      main.append(host.classicForm())
      return
    }

    const config = activity.config
    const promptId = `ad-prompt-${idCounter}`
    const promptLabel = el('label', 'adm-label', 'Що сказати дитині')
    promptLabel.htmlFor = promptId
    const prompt = el('textarea', 'adm-input')
    prompt.id = promptId
    prompt.rows = 2
    prompt.value = text(config.prompt)
    prompt.addEventListener('input', () => { setText(config, 'prompt', prompt.value); host.touched(); refreshPreview() })
    main.append(promptLabel, prompt)

    const categories = (Array.isArray(config.categories) ? config.categories as unknown[] : []).filter(isRecord)
    const items = (Array.isArray(config.items) ? config.items as unknown[] : []).filter(isRecord)
    const placement = isRecord(activity.scoring.key?.placement) ? activity.scoring.key!.placement as Record<string, unknown> : {}

    const bar = el('div', 'ad-bar')
    bar.append(el('p', 'adm-label', 'Групи і картки'))
    if (categories.length < CLASSIFY_LIMITS.categories.max) {
      bar.append(button('+ Група', 'btn-adm-ghost btn--sm', () => { addClassifyCategory(activity); structural() }))
    }
    main.append(bar)

    const columns = el('div', 'ad-columns')
    categories.forEach((category, ci) => {
      const categoryId = String(category.id)
      const column = el('div', 'ad-column')
      const top = el('div', 'ad-column__top')
      const name = el('input', 'adm-input adm-input--sm ad-column__name')
      name.type = 'text'
      name.maxLength = 200
      name.value = text(category.label)
      name.placeholder = `Група ${ci + 1}`
      name.setAttribute('aria-label', `Назва групи ${ci + 1}`)
      name.addEventListener('input', () => { setText(category, 'label', name.value); host.touched(); refreshPreview() })
      top.append(name)
      if (categories.length > CLASSIFY_LIMITS.categories.min) {
        const drop = button('Прибрати', 'btn-adm-ghost btn--sm', () => { removeClassifyCategory(activity, categoryId); structural() })
        drop.setAttribute('aria-label', `Прибрати групу ${ci + 1}; її картки перейдуть у першу групу`)
        top.append(drop)
      }
      column.append(top)

      const inGroup = items.filter(item => placement[String(item.id)] === categoryId)
      column.append(el('p', 'ad-column__count', cardsLabel(inGroup.length)))
      for (const item of inGroup) column.append(renderCardRow(item, categoryId, categories))
      if (items.length < CLASSIFY_LIMITS.items.max) {
        column.append(button('+ Картка', 'ad-add', () => {
          const id = addClassifyItem(activity, categoryId)
          structural()
          if (id) card.querySelector<HTMLElement>(`[data-card-input="${CSS.escape(id)}"]`)?.focus()
        }))
      }
      columns.append(column)
    })
    const homeless = items.filter(item => !categories.some(category => category.id === placement[String(item.id)]))
    if (homeless.length) {
      const column = el('div', 'ad-column ad-column--loose')
      column.append(el('p', 'adm-label', 'Без групи'))
      for (const item of homeless) column.append(renderCardRow(item, '', categories))
      columns.append(column)
    }
    main.append(columns)

    // What the child sees, redrawn as the author types.
    const preview = el('div', 'ad-panel')
    preview.append(el('p', 'adm-label', 'Так побачить дитина'))
    const screen = el('div', 'ad-preview')
    preview.append(screen)
    const refreshPreview = () => {
      screen.replaceChildren()
      screen.append(el('p', 'ad-preview__prompt', text(config.prompt) || 'Умова завдання'))
      const chips = el('div', 'ad-preview__chips')
      for (const item of items.slice(0, 8)) chips.append(el('span', 'ad-preview__chip', text(item.label).split(':')[0] || '…'))
      if (items.length > 8) chips.append(el('span', 'ad-preview__chip', `ще ${items.length - 8}`))
      const zones = el('div', 'ad-preview__zones')
      for (const category of categories) zones.append(el('span', 'ad-preview__zone', text(category.label) || 'Група'))
      screen.append(chips, zones)
    }
    refreshPreview()
    aside.append(preview)
  }

  function renderCardRow(item: Json, categoryId: string, categories: Json[]): HTMLElement {
    const activity = block.activity!
    const itemId = String(item.id)
    const row = el('div', 'ad-card-row')
    // A textarea that grows with the text: long cards («Сканер у магазині: …») stay readable.
    const input = el('textarea', 'adm-input adm-input--sm ad-card-row__text')
    input.rows = 1
    input.maxLength = 200
    input.value = text(item.label)
    input.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault() })
    input.placeholder = 'Текст картки'
    input.dataset.cardInput = itemId
    input.setAttribute('aria-label', `Картка: ${text(item.label) || 'без тексту'}`)
    input.addEventListener('input', () => { setText(item, 'label', input.value); host.touched() })
    row.append(input)
    const others = categories.filter(category => category.id !== categoryId)
    if (others.length === 1 && categoryId) {
      const target = others[0]!
      const move = button('⇄', 'btn-adm-ghost btn--sm ad-card-row__move', () => {
        moveClassifyItem(activity, itemId, String(target.id))
        structural()
        card.querySelector<HTMLElement>(`[data-card-input="${CSS.escape(itemId)}"]`)?.focus()
      })
      move.setAttribute('aria-label', `Перенести «${text(item.label) || 'картку'}» у групу «${text(target.label) || 'інша група'}»`)
      move.title = `У групу «${text(target.label)}»`
      row.append(move)
    } else {
      const select = el('select', 'adm-input adm-input--sm ad-card-row__group')
      select.setAttribute('aria-label', `Група для «${text(item.label) || 'картки'}»`)
      if (!categoryId) select.append(new Option('Оберіть групу', '', true, true))
      for (const category of categories) select.append(new Option(text(category.label) || String(category.id), String(category.id), false, category.id === categoryId))
      select.addEventListener('change', () => { moveClassifyItem(activity, itemId, select.value); structural() })
      row.append(select)
    }
    const drop = button('×', 'btn-adm-ghost btn--sm', () => { if (removeClassifyItem(activity, itemId)) structural() })
    drop.setAttribute('aria-label', `Прибрати картку «${text(item.label) || 'без тексту'}»`)
    row.append(drop)
    return row
  }

  // ── Step 2: what we check ──────────────────────────────────────────────────

  function renderCheck(main: HTMLElement) {
    const activity = block.activity!
    const purposes = el('div', 'ad-purposes')
    purposes.setAttribute('role', 'group')
    purposes.setAttribute('aria-label', 'Навіщо це завдання')
    for (const purpose of PURPOSES) {
      const on = activity.telemetry === purpose.id
      const b = button('', `ad-purpose${on ? ' ad-purpose--on' : ''}`, () => {
        setActivityPurpose(lesson, block, purpose.id)
        structural()
      })
      b.setAttribute('aria-pressed', String(on))
      b.append(el('span', 'ad-purpose__title', purpose.title), el('span', 'ad-purpose__hint', purpose.hint))
      purposes.append(b)
    }
    main.append(el('p', 'adm-label', 'Навіщо це завдання'), purposes)

    const links = activity.outcomes ?? []
    main.append(el('p', 'adm-label', 'Які вміння перевіряє'))
    const list = el('ul', 'ad-outcomes')
    links.forEach((link, i) => {
      const li = el('li', 'ad-outcome')
      li.append(el('span', `ad-dot ad-tone--${TAG_TONES[i % TAG_TONES.length]}`))
      const words = el('span', 'ad-outcome__text')
      words.append(el('b', undefined, host.outcomeCode(link.outcomeId)), document.createTextNode(` ${host.outcomeTitle(link.outcomeId)}`))
      li.append(words)
      if (activity.telemetry === 'evidence') {
        const role = el('select', 'adm-input adm-input--sm')
        role.setAttribute('aria-label', `Вага доказу: ${host.outcomeCode(link.outcomeId)}`)
        role.append(new Option('Основний доказ', 'primary'), new Option('Допоміжний', 'supporting'))
        role.value = link.evidenceRole
        role.disabled = activity.scoring.mode === 'client-unverified'
        role.addEventListener('change', () => { link.evidenceRole = role.value as EditableOutcomeLink['evidenceRole']; structural() })
        li.append(role)
      }
      const drop = button('Прибрати', 'btn-adm-ghost btn--sm', () => { host.removeOutcome(link.outcomeId); structural() })
      drop.setAttribute('aria-label', `Прибрати вміння ${host.outcomeCode(link.outcomeId)}`)
      li.append(drop)
      list.append(li)
    })
    if (!links.length) list.append(el('li', 'question-item__meta', 'Завдання ще не пов’язане з вміннями.'))
    main.append(list, host.outcomePicker(id => { host.addOutcome(id); structural() }))

    const choices = outcomeItemChoices(activity)
    if (!choices.length || !links.length) return
    const bar = el('div', 'ad-bar')
    bar.append(el('p', 'adm-label', 'Яка картка яке вміння перевіряє'))
    bar.append(el('p', 'adm-field-hint', `Натисніть мітку, щоб увімкнути чи вимкнути. Кожному вмінню потрібно щонайменше ${MIN_ITEMS_PER_OUTCOME} картки.`))
    main.append(bar)
    const grid = el('div', 'ad-matrix')
    for (const choice of choices) {
      const row = el('div', 'ad-matrix__row')
      row.append(el('span', 'ad-matrix__label', choice.label))
      links.forEach((link, i) => {
        const on = itemCountsFor(link, choice.id)
        const code = host.outcomeCode(link.outcomeId)
        const tag = button(code, `ad-tag ad-tone--${TAG_TONES[i % TAG_TONES.length]}${on ? ' ad-tag--on' : ''}`, () => {
          toggleItemOutcome(activity, link, choice.id)
          structural()
        })
        tag.setAttribute('aria-pressed', String(on))
        tag.setAttribute('aria-label', `«${choice.label}» перевіряє ${code}`)
        row.append(tag)
      })
      grid.append(row)
    }
    main.append(grid)
  }

  // ── Step 3: where it shows ─────────────────────────────────────────────────

  function renderShow(main: HTMLElement) {
    const activity = block.activity!
    const forChildren = block.audience.student
    main.append(el('p', 'adm-label', 'Де з’являється завдання'))
    main.append(checkboxRow('На пристроях учнів', 'Кожна дитина виконує завдання на своєму пристрої. Потрібно для оцінки.',
      block.views.remote, !forChildren, v => { setOnDevices(block, v); structural() }))
    main.append(checkboxRow('На дошці', 'Показати умову всьому класу. Відповіді на дошці не з’являються.',
      block.views.presentation, !forChildren, v => { setOnBoard(block, v); structural() }))
    if (!forChildren) main.append(el('p', 'adm-field-hint', 'Блок бачить лише вчитель («Додатково» в уроці), тому показати його дітям не можна.'))
    const slide = block.views.presentation ? host.slideFields() : null
    if (slide) main.append(slide)
    main.append(host.contentFields())

    const more = el('details', 'cl-advanced')
    more.append(el('summary', undefined, 'Спроби та ID завдання'))
    const attemptsId = `ad-attempts-${idCounter}`
    const attemptsLabel = el('label', 'adm-label', activity.telemetry === 'evidence' ? 'Спроб (для оцінки — 1, якщо не вказати інше)' : 'Спроб (порожньо — 10)')
    attemptsLabel.htmlFor = attemptsId
    const attempts = el('input', 'adm-input adm-input--sm')
    attempts.id = attemptsId
    attempts.type = 'number'
    attempts.min = '1'
    attempts.max = '10'
    attempts.placeholder = activity.telemetry === 'evidence' ? '1' : '10'
    attempts.value = activity.attempts?.max ? String(activity.attempts.max) : ''
    attempts.addEventListener('input', () => {
      if (attempts.value) activity.attempts = { max: Number(attempts.value) }
      else delete activity.attempts
      host.touched()
    })
    const instanceId = `ad-instance-${idCounter}`
    const instanceLabel = el('label', 'adm-label', 'ID завдання (не змінюйте після публікації)')
    instanceLabel.htmlFor = instanceId
    const instance = el('input', 'adm-input adm-input--sm adm-input--code')
    instance.id = instanceId
    instance.maxLength = 64
    instance.value = activity.instanceId
    instance.addEventListener('input', () => { activity.instanceId = instance.value.trim(); host.touched() })
    more.append(attemptsLabel, attempts, instanceLabel, instance)
    main.append(more)

    const json = el('details', 'cl-advanced')
    json.append(el('summary', undefined, 'Для адміністратора: JSON завдання'))
    json.append(host.jsonFields())
    main.append(json)
  }

  // ── Readiness ──────────────────────────────────────────────────────────────

  function renderReadiness(): HTMLElement {
    const panel = el('div', 'ad-panel')
    panel.append(el('p', 'adm-label', 'Готовність'))
    const list = el('ul', 'ad-checks')
    list.setAttribute('aria-live', 'polite')
    for (const check of activityReadiness(block, host.outcomeCode)) {
      const li = el('li', `ad-check ad-check--${check.level}`)
      const mark = el('span', 'ad-check__mark', check.level === 'ok' ? '✓' : '!')
      mark.setAttribute('aria-hidden', 'true')
      li.append(mark)
      const body = el('span', 'ad-check__text', check.text)
      li.append(body)
      if (check.fix === 'make-evidence') {
        body.append(button('Зробити «Для оцінки»', 'btn-adm-ghost btn--sm ad-check__fix', () => { setActivityPurpose(lesson, block, 'evidence'); structural() }))
      } else if (check.fix === 'send-to-devices') {
        body.append(button('Надсилати на пристрої', 'btn-adm-ghost btn--sm ad-check__fix', () => { setOnDevices(block, true); structural() }))
      }
      list.append(li)
    }
    panel.append(list)
    return panel
  }

  document.body.append(root)
  removeTrap = createFocusTrap(root, close)
  render()
  card.querySelector<HTMLElement>('.ad-step--current')?.focus()
  return { refresh: render, close }
}
