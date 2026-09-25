import { richElement } from './rich-text.js'
import type { StudentPracticeMaterial } from './types.js'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

/** Shared safe renderer for the teacher plan and the student device. */
export function renderPracticeContent(material: Pick<StudentPracticeMaterial, 'intro' | 'table' | 'steps'>): HTMLElement {
  const body = el('div', 'le-practice')
  if (material.intro) body.append(richElement('p', material.intro.uk))
  if (material.table) {
    const scroll = el('div', 'le-practice__table-scroll')
    const table = el('table', 'le-practice__table')
    table.setAttribute('aria-label', 'Дані для практичної роботи')
    const head = el('thead')
    const headRow = el('tr')
    for (const cell of material.table.headers) {
      const th = richElement('th', cell.uk)
      th.scope = 'col'
      headRow.append(th)
    }
    head.append(headRow)
    const rows = el('tbody')
    for (const row of material.table.rows) {
      const tr = el('tr')
      for (const cell of row) tr.append(richElement('td', cell.uk))
      rows.append(tr)
    }
    table.append(head, rows)
    scroll.append(table)
    body.append(scroll)
  }
  for (const step of material.steps) {
    if (step.title) body.append(richElement('h3', step.title.uk, 'le-step__title'))
    const list = el('ol', 'le-list')
    for (const item of step.items) list.append(richElement('li', item.uk))
    body.append(list)
  }
  return body
}

export function renderStudentPractice(host: HTMLElement, material: StudentPracticeMaterial): void {
  const card = el('section', 'lj-task')
  card.setAttribute('aria-labelledby', 'lj-task-title')
  const title = richElement('h2', material.heading?.uk ?? 'Практична робота', 'lj-task__title')
  title.id = 'lj-task-title'
  card.append(title, renderPracticeContent(material))
  host.replaceChildren(card)
}
