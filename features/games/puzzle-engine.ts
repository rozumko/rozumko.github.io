import { generatePuzzleSet, type Puzzle, type Token, type PuzzleLine } from './puzzle-data.js'

// Рендер логічних головоломок — один екран, одна головоломка (як місії/сортування).
// Клієнтський, безключовий (локальний навчальний фідбек). Ввід: числове поле
// (2+ клас) або тап (1 клас / терези). Варіанти вибору — окремим рядком під
// рівнянням, слот «?» лишається inline. CSP-safe: лише addEventListener.

const CONCEPT_LABELS: Record<string, string> = {
  patterns: 'Закономірності', algorithms: 'Алгоритми', logic: 'Логіка', abstraction: 'Абстрагування',
}

function starsFor(correct: number, total: number): number {
  if (correct === total) return 3
  if (correct >= Math.ceil(total * 0.6)) return 2
  return 1
}

export function mountPuzzles(root: HTMLElement, grade: number, count = 5) {
  let puzzles: Puzzle[] = []
  let idx = 0
  let correctCount = 0
  let answered = false
  let picked: Record<string, string> = {}

  root.innerHTML = `
    <div class="pz">
      <div class="pz__top">
        <span class="pz__progress"></span>
        <div class="pz__bar"><div class="pz__bar-fill"></div></div>
      </div>
      <div class="pz__stage" aria-live="polite"></div>
      <p class="pz__feedback" aria-live="polite"></p>
      <div class="pz__actions">
        <button class="kid-action pz__check">Перевірити</button>
        <button class="btn-ghost pz__next hidden">Далі →</button>
      </div>
    </div>`

  const el = {
    progress: root.querySelector<HTMLElement>('.pz__progress')!,
    barFill:  root.querySelector<HTMLElement>('.pz__bar-fill')!,
    stage:    root.querySelector<HTMLElement>('.pz__stage')!,
    feedback: root.querySelector<HTMLElement>('.pz__feedback')!,
    check:    root.querySelector<HTMLButtonElement>('.pz__check')!,
    next:     root.querySelector<HTMLButtonElement>('.pz__next')!,
    actions:  root.querySelector<HTMLElement>('.pz__actions')!,
  }
  el.check.addEventListener('click', check)
  el.next.addEventListener('click', () => { idx++; renderCurrent() })

  function tokenHTML(tok: Token, inGrid: boolean): string {
    if (tok.t === 'val') {
      const op = ['+', '=', '−', '→', '×', '÷'].includes(tok.text)
      return `<span class="pz-tok ${op ? 'pz-tok--op' : 'pz-tok--val'}">${tok.text}</span>`
    }
    if (tok.t === 'input') {
      return `<input class="pz-input" inputmode="numeric" autocomplete="off" maxlength="4" data-answer="${tok.id}" aria-label="Відповідь" />`
    }
    // Вибір у сітці — тап-циклування; inline — лише слот (варіанти окремим рядком).
    if (inGrid) {
      return `<button class="pz-cycle" type="button" data-cycle="${tok.id}" data-options="${tok.options.join('|')}" aria-label="Натисни, щоб змінити">?</button>`
    }
    return `<span class="pz-slot" data-slotval="${tok.id}">?</span>`
  }

  function lineHTML(line: PuzzleLine): string {
    return `<div class="pz-line">${line.tokens.map(t => tokenHTML(t, false)).join('')}</div>`
  }

  // Збирає inline-вибори (напр. терези/символи) для ряду варіантів під рівнянням.
  function inlineChoices(pz: Puzzle): Array<{ id: string; options: string[] }> {
    const out: Array<{ id: string; options: string[] }> = []
    for (const line of pz.lines ?? []) for (const t of line.tokens) {
      if (t.t === 'choice') out.push({ id: t.id, options: t.options })
    }
    return out
  }

  function renderCurrent() {
    if (idx >= puzzles.length) return renderResult()
    answered = false
    picked = {}
    el.feedback.textContent = ''
    el.feedback.className = 'pz__feedback'
    el.check.classList.remove('hidden')
    el.check.disabled = false
    el.next.classList.add('hidden')

    const pz = puzzles[idx]
    el.progress.textContent = `${idx + 1} / ${puzzles.length}`
    el.barFill.style.width = `${(idx / puzzles.length) * 100}%`

    let body = ''
    if (pz.grid) {
      body = `<div class="pz-grid" style="--pz-size:${pz.grid.size}">${pz.grid.cells.map(c => `<div class="pz-cell">${tokenHTML(c, true)}</div>`).join('')}</div>`
    } else if (pz.lines) {
      body = pz.lines.map(lineHTML).join('')
    }
    const choices = inlineChoices(pz)
    const optionsHTML = choices.map(ch =>
      `<div class="pz-opts" data-for="${ch.id}">${ch.options.map(o =>
        `<button class="pz-opt" type="button" data-choice="${ch.id}" data-value="${o}">${o}</button>`).join('')}</div>`
    ).join('')

    el.stage.innerHTML = `
      <article class="pz-card">
        <header class="pz-card__head">
          <h3 class="pz-card__title">${pz.title}</h3>
          <span class="pz-card__concept">${CONCEPT_LABELS[pz.concept] ?? pz.concept}</span>
        </header>
        <p class="pz-card__instruction">${pz.instruction}</p>
        <div class="pz-card__body">${body}</div>
        ${optionsHTML ? `<div class="pz-card__answer">${optionsHTML}</div>` : ''}
      </article>`

    // inline-вибір: клік по варіанту заповнює слот
    el.stage.querySelectorAll<HTMLButtonElement>('.pz-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        if (answered) return
        const id = btn.dataset['choice']!
        picked[id] = btn.dataset['value']!
        const slot = el.stage.querySelector<HTMLElement>(`[data-slotval="${id}"]`)
        if (slot) { slot.textContent = btn.dataset['value']!; slot.classList.add('pz-slot--set') }
        el.stage.querySelectorAll<HTMLButtonElement>(`.pz-opt[data-choice="${id}"]`).forEach(b =>
          b.classList.toggle('pz-opt--on', b === btn))
      })
    })
    // сітка: тап-циклування
    el.stage.querySelectorAll<HTMLButtonElement>('.pz-cycle').forEach(btn => {
      const id = btn.dataset['cycle']!
      const options = (btn.dataset['options'] ?? '').split('|')
      btn.addEventListener('click', () => {
        if (answered) return
        const cur = options.indexOf(picked[id] ?? '')
        const nextVal = options[(cur + 1) % options.length]
        picked[id] = nextVal
        btn.textContent = nextVal
        btn.classList.add('pz-cycle--set')
      })
    })
  }

  function readAnswer(id: string): string {
    if (id in picked) return picked[id]
    const inp = el.stage.querySelector<HTMLInputElement>(`.pz-input[data-answer="${id}"]`)
    return inp ? inp.value.trim() : ''
  }

  function check() {
    if (answered) return
    const pz = puzzles[idx]
    const ids = Object.keys(pz.answers)
    const filled = ids.filter(id => readAnswer(id) !== '')
    if (filled.length < ids.length) {
      el.feedback.textContent = 'Заповни всі поля 🙂'
      el.feedback.className = 'pz__feedback'
      return
    }
    answered = true
    el.stage.querySelectorAll('input, button').forEach(n => ((n as HTMLButtonElement).disabled = true))
    const ok = ids.every(id => readAnswer(id) === pz.answers[id])
    if (ok) {
      correctCount++
      el.feedback.textContent = '✓ Правильно! Молодець!'
      el.feedback.className = 'pz__feedback pz__feedback--ok'
    } else {
      el.feedback.textContent = '✗ Ще не так. Підказка: ' + pz.hint
      el.feedback.className = 'pz__feedback pz__feedback--bad'
    }
    el.check.classList.add('hidden')
    el.next.textContent = idx + 1 < puzzles.length ? 'Далі →' : 'Побачити результат'
    el.next.classList.remove('hidden')
    el.barFill.style.width = `${((idx + 1) / puzzles.length) * 100}%`
  }

  function renderResult() {
    const stars = starsFor(correctCount, puzzles.length)
    el.progress.textContent = ''
    el.feedback.textContent = ''
    el.actions.classList.add('hidden')
    el.stage.innerHTML = `
      <div class="pz-done">
        <p class="pz-done__stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
        <p class="pz-done__title">Розвʼязано ${correctCount} з ${puzzles.length}!</p>
        <button class="kid-action pz-done__again">Ще головоломки</button>
      </div>`
    el.stage.querySelector<HTMLButtonElement>('.pz-done__again')!.addEventListener('click', start)
  }

  function start() {
    puzzles = generatePuzzleSet(grade, count)
    idx = 0
    correctCount = 0
    el.actions.classList.remove('hidden')
    renderCurrent()
  }

  start()
}
