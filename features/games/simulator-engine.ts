// Рушій «симулятор» — сюжетна стейт-машина з виборами (порт з temp/new/assembly).
// Клієнтський і безключовий: навчальний фідбек локальний, помилки — це
// fail-вузли сюжету. CSP-safe: лише addEventListener, іконки — емодзі.

export type SimState = Record<string, boolean>

export interface SimChoice {
  text: string | ((s: SimState) => string)
  next: string | ((s: SimState) => string)
  action?: (s: SimState) => void
}

export interface SimNode {
  /** Емодзі-іконка сцени. */
  icon: string
  text: string | ((s: SimState) => string)
  /** Навчальна вставка «Це цікаво». */
  info?: string
  choices: SimChoice[] | ((s: SimState) => SimChoice[])
  /** Вузол-помилка: візит рахується як помилка для зірок. */
  isFail?: boolean
}

export interface SimStatus {
  label: string | ((s: SimState) => string)
  active: (s: SimState) => boolean
  /** «Небезпечний» стан (напр. живлення увімкнено під час збірки). */
  danger?: (s: SimState) => boolean
}

export interface SimScenario {
  id: string
  title: string
  initialState: () => SimState
  statuses: SimStatus[]
  nodes: Record<string, SimNode>
  startNode: string
  /** Візит цього вузла = сценарій пройдено. */
  winNode: string
}

export interface SimSummary {
  steps: number
  mistakes: number
  stars: number
}

export interface SimOptions {
  onComplete?: (summary: SimSummary) => void
}

/** 3 зірки — без помилок, 2 — одна-дві, інакше 1. */
function starsFor(mistakes: number): number {
  if (mistakes === 0) return 3
  if (mistakes <= 2) return 2
  return 1
}

/**
 * Перевірка цілісності графа сценарію (для тестів): усі статичні `next`
 * і `next` динамічних виборів на початковому стані вказують на наявні вузли.
 */
export function validateScenario(scenario: SimScenario): string[] {
  const errors: string[] = []
  if (!scenario.nodes[scenario.startNode]) errors.push(`startNode «${scenario.startNode}» не існує`)
  if (!scenario.nodes[scenario.winNode]) errors.push(`winNode «${scenario.winNode}» не існує`)
  const state = scenario.initialState()
  for (const [id, node] of Object.entries(scenario.nodes)) {
    const choices = typeof node.choices === 'function' ? node.choices(state) : node.choices
    for (const ch of choices) {
      const next = typeof ch.next === 'function' ? ch.next(state) : ch.next
      if (!scenario.nodes[next]) errors.push(`${id}: перехід на неіснуючий вузол «${next}»`)
    }
  }
  return errors
}

export function mountSimulator(root: HTMLElement, scenario: SimScenario, opts: SimOptions = {}) {
  let state = scenario.initialState()
  let steps = 0
  let mistakes = 0
  let completed = false

  root.innerHTML = `
    <div class="sim">
      <div class="sim__statuses" role="group" aria-label="Стан складання"></div>
      <article class="sim-card">
        <div class="sim-card__icon" aria-hidden="true"></div>
        <p class="sim-card__text"></p>
        <p class="sim-card__info hidden"></p>
      </article>
      <div class="sim__choices" role="group" aria-label="Вибір дії"></div>
    </div>`

  const el = {
    statuses: root.querySelector<HTMLElement>('.sim__statuses')!,
    icon:     root.querySelector<HTMLElement>('.sim-card__icon')!,
    text:     root.querySelector<HTMLElement>('.sim-card__text')!,
    info:     root.querySelector<HTMLElement>('.sim-card__info')!,
    choices:  root.querySelector<HTMLElement>('.sim__choices')!,
  }

  function renderStatuses() {
    el.statuses.innerHTML = ''
    for (const st of scenario.statuses) {
      const chip = document.createElement('span')
      const danger = st.danger?.(state) ?? false
      chip.className = `sim-status${st.active(state) ? ' sim-status--on' : ''}${danger ? ' sim-status--danger' : ''}`
      chip.textContent = typeof st.label === 'function' ? st.label(state) : st.label
      el.statuses.appendChild(chip)
    }
  }

  function renderNode(nodeId: string) {
    const node = scenario.nodes[nodeId]
    if (!node) return
    if (node.isFail) mistakes++
    renderStatuses()

    el.icon.textContent = node.icon
    el.text.textContent = typeof node.text === 'function' ? node.text(state) : node.text
    if (node.info) {
      el.info.textContent = `💡 ${node.info}`
      el.info.classList.remove('hidden')
    } else {
      el.info.classList.add('hidden')
    }

    el.choices.innerHTML = ''
    const choices = typeof node.choices === 'function' ? node.choices(state) : node.choices
    for (const ch of choices) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'sim-choice'
      btn.textContent = typeof ch.text === 'function' ? ch.text(state) : ch.text
      btn.addEventListener('click', () => {
        steps++
        ch.action?.(state)
        const next = typeof ch.next === 'function' ? ch.next(state) : ch.next
        if (next === scenario.startNode && nodeId === scenario.winNode) {
          // «Зіграти ще раз» із win-вузла — свіжий стан і лічильники.
          state = scenario.initialState()
          steps = 0
          mistakes = 0
          completed = false
        }
        renderNode(next)
      })
      el.choices.appendChild(btn)
    }

    if (nodeId === scenario.winNode && !completed) {
      completed = true
      opts.onComplete?.({ steps, mistakes, stars: starsFor(mistakes) })
    }
  }

  renderNode(scenario.startNode)
}
