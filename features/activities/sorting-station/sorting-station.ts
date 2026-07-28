import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import {
  binIdForItem,
  generateSortingStationSet,
  type SortingStationItem,
  type SortingStationSet,
  type SortingStationVisual,
} from './sorting-station-data.js'

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

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function renderVisual(visual: SortingStationVisual): HTMLElement {
  if (visual.kind === 'emoji') return el('span', 'ss-emoji', visual.emoji)
  const shape = el('span', `ss-shape ss-shape--${visual.shape} ss-shape--${visual.color}`)
  shape.setAttribute('aria-hidden', 'true')
  return shape
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const startedAt = Date.now()
  const set = generateSortingStationSet(options.grade, options.level)
  const queue = shuffle(set.items)
  let currentIndex = 0
  let correct = 0
  let mistakes = 0
  let finished = false
  let feedback = ''

  container.classList.add('ss-root')
  options.onProgress?.(0, queue.length)

  function result(): ActivityRunResult {
    return {
      correct,
      total: queue.length,
      mistakes,
      durationSec: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  function finish() {
    finished = true
    render()
    options.onFinish(result())
  }

  function choose(itemId: string, binId: string) {
    if (finished) return
    const item = queue[currentIndex]
    if (!item || item.id !== itemId) return
    if (binId === binIdForItem(set, item)) {
      currentIndex += 1
      correct += 1
      feedback = ''
      options.onProgress?.(correct, queue.length)
      if (currentIndex >= queue.length) finish()
      else render()
      return
    }
    mistakes += 1
    feedback = 'Не зовсім. Перевір обидві ознаки: рядок і стовпчик.'
    render()
  }

  function renderItem(item: SortingStationItem): HTMLElement {
    const card = el('article', 'ss-card')
    const visual = el('div', 'ss-card__visual')
    visual.appendChild(renderVisual(item.visual))
    card.appendChild(visual)
    card.appendChild(el('p', 'ss-card__label', item.label))
    return card
  }

  function renderGrid(set: SortingStationSet, item: SortingStationItem): HTMLElement {
    const grid = el('div', 'ss-grid')
    grid.style.setProperty('--ss-cols', String(set.axes[1].values.length))
    grid.appendChild(el('div', 'ss-corner', set.axes[0].label))
    for (const col of set.axes[1].values) grid.appendChild(el('div', 'ss-axis ss-axis--col', col.label))
    for (const row of set.axes[0].values) {
      grid.appendChild(el('div', 'ss-axis ss-axis--row', row.label))
      for (const col of set.axes[1].values) {
        const binId = `${row.id}:${col.id}`
        const button = el('button', 'ss-bin')
        button.type = 'button'
        button.textContent = `${row.label} + ${col.label}`
        button.addEventListener('click', () => choose(item.id, binId))
        grid.appendChild(button)
      }
    }
    return grid
  }

  function render() {
    container.textContent = ''
    const shell = el('section', 'ss-shell')
    const top = el('div', 'ss-top')
    top.appendChild(el('p', 'ss-progress', finished ? `${queue.length} / ${queue.length}` : `${currentIndex + 1} / ${queue.length}`))
    top.appendChild(el('p', 'ss-score', `Правильно: ${correct}`))
    shell.appendChild(top)

    if (finished) {
      shell.appendChild(el('h2', 'ss-title', 'Станцію відсортовано!'))
      shell.appendChild(el('p', 'ss-instruction', mistakes === 0 ? 'Усі предмети стали на свої місця без помилок.' : `Предмети на місцях. Помилок: ${mistakes}.`))
      container.appendChild(shell)
      return
    }

    const item = queue[currentIndex]
    if (!item) return
    shell.appendChild(el('h2', 'ss-title', set.title))
    shell.appendChild(el('p', 'ss-instruction', set.instruction))
    shell.appendChild(renderItem(item))
    shell.appendChild(renderGrid(set, item))
    shell.appendChild(el('p', feedback ? 'ss-feedback ss-feedback--show' : 'ss-feedback', feedback || ' '))
    container.appendChild(shell)
  }

  render()

  return {
    snapshot: result,
    destroy() {
      container.textContent = ''
      container.classList.remove('ss-root')
    },
  }
}
