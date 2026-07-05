import { generatePuzzleSet, type Puzzle, type Token, type PuzzleLine } from './puzzle-data.js'

// Рендер логічних головоломок + взаємодія. Клієнтський, безключовий (перевірка
// локальна — навчальний фідбек, не серверний скоринг). Ввід: числове поле
// (2+ клас) або тап-варіанти (1 клас / терези). CSP-safe: лише addEventListener.

const CONCEPT_LABELS: Record<string, string> = {
  patterns: 'Закономірності', algorithms: 'Алгоритми', logic: 'Логіка', abstraction: 'Абстрагування',
}

interface Mounted { grade: number; puzzles: Puzzle[]; picked: Record<string, string> }

export function mountPuzzles(root: HTMLElement, grade: number, count = 5) {
  const state: Mounted = { grade, puzzles: [], picked: {} }

  root.innerHTML = `
    <div class="pz">
      <div class="pz__list"></div>
      <div class="pz__actions">
        <button class="kid-action pz__check">Перевірити</button>
        <button class="btn-ghost pz__new">Нові головоломки</button>
      </div>
      <p class="pz__result hidden" aria-live="polite"></p>
    </div>`

  const listEl   = root.querySelector<HTMLElement>('.pz__list')!
  const resultEl = root.querySelector<HTMLElement>('.pz__result')!
  root.querySelector<HTMLButtonElement>('.pz__check')!.addEventListener('click', check)
  root.querySelector<HTMLButtonElement>('.pz__new')!.addEventListener('click', newSet)

  function tokenHTML(tok: Token, inGrid: boolean): string {
    if (tok.t === 'val') {
      const op = ['+', '=', '−', '→', '×', '÷'].includes(tok.text)
      return `<span class="pz-tok ${op ? 'pz-tok--op' : 'pz-tok--val'}">${tok.text}</span>`
    }
    if (tok.t === 'input') {
      return `<input class="pz-input" inputmode="numeric" autocomplete="off" maxlength="4" data-answer="${tok.id}" aria-label="Відповідь" />`
    }
    // Вибір у сітці — тап-циклування клітинки; inline — кнопки варіантів (тап).
    if (inGrid) {
      return `<button class="pz-cycle" type="button" data-cycle="${tok.id}" data-options="${tok.options.join('|')}" aria-label="Натисни, щоб змінити">?</button>`
    }
    const opts = tok.options.map(o => `<button class="pz-opt" type="button" data-choice="${tok.id}" data-value="${o}">${o}</button>`).join('')
    return `<span class="pz-choice"><span class="pz-slot" data-slotval="${tok.id}">?</span><span class="pz-opts">${opts}</span></span>`
  }

  function lineHTML(line: PuzzleLine): string {
    return `<div class="pz-line">${line.tokens.map(t => tokenHTML(t, false)).join('')}</div>`
  }

  function puzzleHTML(pz: Puzzle): string {
    let body = ''
    if (pz.grid) {
      body = `<div class="pz-grid" style="--pz-size:${pz.grid.size}">${pz.grid.cells.map(c => `<div class="pz-cell">${tokenHTML(c, true)}</div>`).join('')}</div>`
    } else if (pz.lines) {
      body = pz.lines.map(lineHTML).join('')
    }
    return `
      <article class="pz-card" data-pid="${pz.id}">
        <header class="pz-card__head">
          <h3 class="pz-card__title">${pz.title}</h3>
          <span class="pz-card__concept">${CONCEPT_LABELS[pz.concept] ?? pz.concept}</span>
        </header>
        <p class="pz-card__instruction">${pz.instruction}</p>
        <div class="pz-card__body">${body}</div>
        <p class="pz-card__feedback" aria-live="polite"></p>
      </article>`
  }

  function render() {
    state.picked = {}
    resultEl.classList.add('hidden')
    resultEl.textContent = ''
    listEl.innerHTML = state.puzzles.map(puzzleHTML).join('')
    // inline тап-варіанти
    listEl.querySelectorAll<HTMLButtonElement>('.pz-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['choice']!
        state.picked[id] = btn.dataset['value']!
        const slot = listEl.querySelector<HTMLElement>(`[data-slotval="${id}"]`)
        if (slot) slot.textContent = btn.dataset['value']!
        listEl.querySelectorAll<HTMLButtonElement>(`.pz-opt[data-choice="${id}"]`).forEach(b =>
          b.classList.toggle('pz-opt--on', b === btn))
      })
    })
    // сітка: тап-циклування клітинки по варіантах
    listEl.querySelectorAll<HTMLButtonElement>('.pz-cycle').forEach(btn => {
      const id = btn.dataset['cycle']!
      const options = (btn.dataset['options'] ?? '').split('|')
      btn.addEventListener('click', () => {
        const cur = options.indexOf(state.picked[id] ?? '')
        const next = options[(cur + 1) % options.length]
        state.picked[id] = next
        btn.textContent = next
        btn.classList.add('pz-cycle--set')
      })
    })
  }

  function newSet() {
    state.puzzles = generatePuzzleSet(state.grade, count)
    render()
  }

  function readAnswer(id: string): string {
    if (id in state.picked) return state.picked[id]
    const inp = listEl.querySelector<HTMLInputElement>(`.pz-input[data-answer="${id}"]`)
    return inp ? inp.value.trim() : ''
  }

  function check() {
    let solved = 0
    for (const pz of state.puzzles) {
      const card = listEl.querySelector<HTMLElement>(`.pz-card[data-pid="${pz.id}"]`)!
      const fb = card.querySelector<HTMLElement>('.pz-card__feedback')!
      const ids = Object.keys(pz.answers)
      const answered = ids.filter(id => readAnswer(id) !== '')
      const correct = ids.filter(id => readAnswer(id) === pz.answers[id])
      card.classList.remove('pz-card--ok', 'pz-card--bad')
      if (correct.length === ids.length) {
        solved++
        card.classList.add('pz-card--ok')
        fb.textContent = '✓ Правильно!'
      } else if (answered.length === 0) {
        fb.textContent = 'Спробуй розв’язати 🙂'
      } else {
        card.classList.add('pz-card--bad')
        fb.textContent = '✗ Ще не так. Підказка: ' + pz.solution
      }
    }
    const total = state.puzzles.length
    resultEl.textContent = solved === total
      ? `🏆 Усі ${total} розвʼязано! Чудова робота!`
      : `Розвʼязано ${solved} з ${total}. Спробуй виправити решту.`
    resultEl.classList.remove('hidden')
  }

  newSet()
}
