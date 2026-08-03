import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import {
  generateMessageCodingSet,
  type MessageCodingDisplay,
  type MessageCodingTask,
} from './message-coding-data.js'

const TOTAL = 5

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function renderDisplay(display: MessageCodingDisplay): HTMLElement {
  const wrap = el('div', `mc-display mc-display--${display.kind}`)
  if (display.kind === 'text') {
    wrap.textContent = display.value
    return wrap
  }
  if (display.kind === 'chips') {
    for (const chip of display.chips) wrap.appendChild(el('span', 'mc-chip', chip))
    return wrap
  }
  if (display.kind === 'cipher') {
    for (const token of display.tokens) wrap.appendChild(el('span', 'mc-code-token', token))
    return wrap
  }
  if (display.kind === 'key') {
    const examples = el('div', 'mc-key-examples')
    for (const example of display.examples) {
      const row = el('div', 'mc-key-row')
      const coded = el('span', 'mc-key-code')
      for (const token of example.tokens) coded.appendChild(el('span', 'mc-key-token', token))
      row.appendChild(coded)
      row.appendChild(el('span', 'mc-key-equals', '='))
      row.appendChild(el('strong', 'mc-key-plain', example.plain))
      examples.appendChild(row)
    }
    wrap.appendChild(examples)

    const challenge = el('div', 'mc-key-challenge')
    const coded = el('span', 'mc-key-code')
    for (const token of display.challenge) coded.appendChild(el('span', 'mc-key-token', token))
    challenge.appendChild(coded)
    challenge.appendChild(el('span', 'mc-key-equals', '='))
    challenge.appendChild(el('strong', 'mc-key-unknown', '?'))
    wrap.appendChild(challenge)
    return wrap
  }
  if (display.kind === 'binary') {
    display.bits.split('').forEach((bit, index) => {
      const lamp = el('span', bit === '1' ? 'mc-lamp mc-lamp--on' : 'mc-lamp')
      lamp.setAttribute('aria-label', `${display.weights[index]}: ${bit}`)
      lamp.appendChild(el('span', 'mc-lamp__bit', bit))
      lamp.appendChild(el('span', 'mc-lamp__weight', String(display.weights[index])))
      wrap.appendChild(lamp)
    })
    return wrap
  }
  if (display.kind === 'pixels') {
    wrap.style.setProperty('--mc-size', String(display.rows[0]?.length ?? 1))
    for (const row of display.rows) {
      for (const cell of row) wrap.appendChild(el('span', cell === '1' ? 'mc-pixel mc-pixel--on' : 'mc-pixel'))
    }
    return wrap
  }
  return wrap
}

function renderLegend(task: MessageCodingTask): HTMLElement {
  const legend = el('div', 'mc-legend')
  for (const item of task.legend) {
    const entry = el('span', 'mc-legend__item')
    entry.appendChild(el('strong', '', item.code))
    entry.appendChild(document.createTextNode(` ${item.label}`))
    legend.appendChild(entry)
  }
  return legend
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const startedAt = Date.now()
  const tasks = generateMessageCodingSet(options.grade, options.level).slice(0, TOTAL)
  let currentIndex = 0
  let correct = 0
  let mistakes = 0
  let finished = false
  let feedback = ''

  container.classList.add('mc-root')
  options.onProgress?.(0, tasks.length)

  function result(): ActivityRunResult {
    return {
      correct,
      total: tasks.length,
      mistakes,
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  function finish() {
    finished = true
    render()
    options.onFinish(result())
  }

  function choose(taskId: string, index: number) {
    if (finished) return
    const task = tasks[currentIndex]
    if (!task) return
    if (task.id !== taskId) return
    if (index === task.answerIndex) {
      correct += 1
      currentIndex += 1
      feedback = ''
      options.onProgress?.(correct, tasks.length)
      if (currentIndex >= tasks.length) finish()
      else render()
      return
    }
    mistakes += 1
    feedback = 'Ще раз уважно звір код із підказкою.'
    render()
  }

  function render() {
    container.textContent = ''
    const shell = el('section', 'mc-card')
    const top = el('div', 'mc-top')
    top.appendChild(el('p', 'mc-step', finished ? `${tasks.length} / ${tasks.length}` : `${currentIndex + 1} / ${tasks.length}`))
    top.appendChild(el('p', 'mc-score', `Правильно: ${correct}`))
    shell.appendChild(top)

    if (finished) {
      shell.appendChild(el('h2', 'mc-title', 'Повідомлення розкодовано!'))
      shell.appendChild(el('p', 'mc-prompt', mistakes === 0 ? 'Усе чисто: жодної зайвої спроби.' : `Є результат. Помилок: ${mistakes}.`))
      container.appendChild(shell)
      return
    }

    const task = tasks[currentIndex]
    if (!task) return
    shell.appendChild(el('h2', 'mc-title', task.title))
    shell.appendChild(el('p', 'mc-prompt', task.prompt))
    shell.appendChild(renderDisplay(task.display))
    shell.appendChild(renderLegend(task))

    const answers = el('div', 'mc-options')
    task.options.forEach((answer, index) => {
      const button = el('button', 'mc-option', answer)
      button.type = 'button'
      button.addEventListener('click', () => choose(task.id, index))
      answers.appendChild(button)
    })
    shell.appendChild(answers)
    const note = el('p', feedback ? 'mc-feedback mc-feedback--show' : 'mc-feedback', feedback || ' ')
    shell.appendChild(note)
    container.appendChild(shell)
  }

  render()

  return {
    snapshot: result,
    destroy() {
      container.textContent = ''
      container.classList.remove('mc-root')
    },
  }
}
