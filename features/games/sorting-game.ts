import type { SortingLevel } from './sorting-data.js'

// Движок гри-сортування (класифікація за ознакою). Клієнтський і безключовий:
// «правильність» тут — навчальний фідбек для дитини, жодного сервер-скорингу
// чи персональних даних. Взаємодія — тап по кошику (touch-friendly, без drag).

export interface SortingSummary {
  totalItems: number
  mistakes: number
  levels: number
}

export interface SortingGameOptions {
  onComplete?: (summary: SortingSummary) => void
}

export function mountSortingGame(root: HTMLElement, levels: SortingLevel[], opts: SortingGameOptions = {}) {
  let levelIdx = 0
  let queue: { emoji: string; bin: string; label?: string }[] = []
  let mistakes = 0
  let locked = false
  const totalItems = levels.reduce((n, l) => n + l.items.length, 0)

  root.innerHTML = `
    <div class="sg">
      <div class="sg__top">
        <p class="sg__instruction" aria-live="polite"></p>
        <p class="sg__progress"></p>
      </div>
      <div class="sg__item-wrap"><div class="sg__item" aria-live="polite"><span class="sg__item-emoji"></span><span class="sg__item-label hidden"></span></div></div>
      <p class="sg__hint">Куди належить цей предмет? Натисни кошик!</p>
      <div class="sg__bins" role="group" aria-label="Кошики для сортування"></div>
      <div class="sg__done hidden">
        <p class="sg__done-emoji">🏆</p>
        <p class="sg__done-title">Молодець! Усе відсортовано!</p>
        <p class="sg__done-sub"></p>
        <button class="kid-action sg__restart">Грати ще раз</button>
      </div>
    </div>`

  const el = {
    instruction: root.querySelector<HTMLElement>('.sg__instruction')!,
    progress:    root.querySelector<HTMLElement>('.sg__progress')!,
    itemWrap:    root.querySelector<HTMLElement>('.sg__item-wrap')!,
    item:        root.querySelector<HTMLElement>('.sg__item')!,
    itemEmoji:   root.querySelector<HTMLElement>('.sg__item-emoji')!,
    itemLabel:   root.querySelector<HTMLElement>('.sg__item-label')!,
    hint:        root.querySelector<HTMLElement>('.sg__hint')!,
    bins:        root.querySelector<HTMLElement>('.sg__bins')!,
    done:        root.querySelector<HTMLElement>('.sg__done')!,
    doneSub:     root.querySelector<HTMLElement>('.sg__done-sub')!,
  }

  root.querySelector<HTMLButtonElement>('.sg__restart')!.addEventListener('click', () => {
    levelIdx = 0
    mistakes = 0
    el.done.classList.add('hidden')
    setPlayVisible(true)
    startLevel()
  })

  function setPlayVisible(visible: boolean) {
    for (const node of [el.itemWrap, el.hint, el.bins, el.instruction, el.progress]) {
      node.classList.toggle('hidden', !visible)
    }
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function startLevel() {
    const level = levels[levelIdx]
    queue = shuffle(level.items.map(i => ({ emoji: i.emoji, bin: i.bin, label: i.label })))
    el.instruction.textContent = level.instruction
    el.bins.innerHTML = ''
    level.bins.forEach((bin, i) => {
      const btn = document.createElement('button')
      btn.className = `sg__bin sg__bin--${i % 3}`
      btn.textContent = bin.label
      btn.addEventListener('click', () => place(bin.id, btn))
      el.bins.appendChild(btn)
    })
    showItem()
  }

  function showItem() {
    el.progress.textContent = `Рівень ${levelIdx + 1} з ${levels.length} · залишилось ${queue.length}`
    el.itemEmoji.textContent = queue[0]?.emoji ?? ''
    el.itemLabel.textContent = queue[0]?.label ?? ''
    el.itemLabel.classList.toggle('hidden', !queue[0]?.label)
    el.item.classList.remove('sg__item--pop')
    void el.item.offsetWidth  // перезапуск CSS-анімації
    el.item.classList.add('sg__item--pop')
  }

  function place(binId: string, btn: HTMLButtonElement) {
    if (locked || !queue.length) return
    const current = queue[0]
    if (current.bin === binId) {
      queue.shift()
      btn.classList.add('sg__bin--correct')
      setTimeout(() => btn.classList.remove('sg__bin--correct'), 350)
      if (!queue.length) return nextLevel()
      showItem()
    } else {
      mistakes++
      locked = true
      el.item.classList.add('sg__item--shake')
      btn.classList.add('sg__bin--wrong')
      setTimeout(() => {
        el.item.classList.remove('sg__item--shake')
        btn.classList.remove('sg__bin--wrong')
        locked = false
      }, 450)
    }
  }

  function nextLevel() {
    levelIdx++
    if (levelIdx < levels.length) {
      startLevel()
      return
    }
    setPlayVisible(false)
    el.doneSub.textContent = mistakes === 0
      ? `Жодної помилки — ідеально! Предметів: ${totalItems}.`
      : `Предметів: ${totalItems}, помилок: ${mistakes}. Наступного разу буде ще краще!`
    el.done.classList.remove('hidden')
    opts.onComplete?.({ totalItems, mistakes, levels: levels.length })
  }

  startLevel()
}
