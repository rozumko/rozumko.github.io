import type { ActivityHandle, ActivityMount, ActivityRunResult } from '../activity-contract.js'
import {
  getSchoolFactOpinionStatements,
  submitSchoolFactOpinionAnswer,
  type SchoolFactOpinionChoice,
} from '../../api/client.js'

const TOTAL = 10

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1))
    ;[out[index], out[next]] = [out[next]!, out[index]!]
  }
  return out
}

export const mount: ActivityMount = (container, options): ActivityHandle => {
  const startedAt = Date.now()
  let statements: Array<{ id: string; text: string }> = []
  let index = 0
  let correct = 0
  let mistakes = 0
  let answered = false
  let finished = false

  container.classList.add('fo-activity-root')
  container.innerHTML = `
    <div class="fo">
      <div class="fo__top"><span class="fo__progress">Завантаження…</span><div class="fo__bar"><div class="fo__bar-fill"></div></div></div>
      <div class="fo__stage"></div>
      <div class="fo__feedback-wrap">
        <p class="fo__feedback" role="status"></p>
        <p class="fo__explanation hidden"></p>
        <button type="button" class="btn-next fo__next hidden">Далі →</button>
      </div>
    </div>`

  const progressEl = container.querySelector<HTMLElement>('.fo__progress')!
  const bar = container.querySelector<HTMLElement>('.fo__bar-fill')!
  const stage = container.querySelector<HTMLElement>('.fo__stage')!
  const feedback = container.querySelector<HTMLElement>('.fo__feedback')!
  const explanation = container.querySelector<HTMLElement>('.fo__explanation')!
  const next = container.querySelector<HTMLButtonElement>('.fo__next')!

  function result(): ActivityRunResult {
    return {
      correct,
      total: TOTAL,
      mistakes,
      durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    }
  }

  function showError(message: string) {
    progressEl.textContent = ''
    stage.innerHTML = '<p class="fo-activity-error"></p>'
    stage.querySelector<HTMLElement>('.fo-activity-error')!.textContent = message
  }

  function finish() {
    if (finished) return
    finished = true
    options.onProgress?.(TOTAL, TOTAL)
    options.onFinish(result())
  }

  async function answer(choice: SchoolFactOpinionChoice, button: HTMLButtonElement) {
    if (answered || finished) return
    const statement = statements[index]
    if (!statement || !options.participantId || !options.participantToken) return
    answered = true
    stage.querySelectorAll<HTMLButtonElement>('.fo-answer').forEach(item => { item.disabled = true })
    feedback.textContent = 'Перевіряємо…'
    feedback.className = 'fo__feedback'

    try {
      const scored = await submitSchoolFactOpinionAnswer(
        options.participantId,
        options.participantToken,
        statement.id,
        choice,
      )
      if (scored.correct) correct += 1
      else mistakes += 1
      button.classList.add(scored.correct ? 'fo-answer--right' : 'fo-answer--wrong')
      feedback.textContent = scored.correct ? '✓ Правильно!' : 'Не цього разу — прочитай пояснення.'
      feedback.className = `fo__feedback ${scored.correct ? 'fo__feedback--ok' : 'fo__feedback--bad'}`
      explanation.textContent = scored.explanation
      explanation.classList.remove('hidden')
      next.textContent = index + 1 < TOTAL ? 'Далі →' : 'Показати результат'
      next.classList.remove('hidden')
      bar.style.width = `${((index + 1) / TOTAL) * 100}%`
      options.onProgress?.(index + 1, TOTAL)
      next.focus()
    } catch {
      answered = false
      stage.querySelectorAll<HTMLButtonElement>('.fo-answer').forEach(item => { item.disabled = false })
      feedback.textContent = 'Не вдалося перевірити відповідь. Спробуй ще раз.'
      feedback.className = 'fo__feedback fo__feedback--bad'
    }
  }

  function render() {
    const statement = statements[index]
    if (!statement) { finish(); return }
    answered = false
    progressEl.textContent = `${index + 1} / ${TOTAL}`
    bar.style.width = `${(index / TOTAL) * 100}%`
    feedback.textContent = ''
    feedback.className = 'fo__feedback'
    explanation.textContent = ''
    explanation.classList.add('hidden')
    next.classList.add('hidden')
    stage.innerHTML = `
      <article class="fo-card">
        <p class="fo-card__text"></p>
        <p class="fo-card__hint">Що це за твердження?</p>
        <div class="fo-card__answers" role="group" aria-label="Вибір категорії"></div>
      </article>`
    stage.querySelector<HTMLElement>('.fo-card__text')!.textContent = statement.text
    const answers = stage.querySelector<HTMLElement>('.fo-card__answers')!
    const variants: Array<{ choice: SchoolFactOpinionChoice; label: string }> = [
      { choice: 'fact', label: '✅ Факт' },
      { choice: 'opinion', label: '💬 Думка' },
    ]
    for (const variant of variants) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `fo-answer fo-answer--${variant.choice}`
      button.textContent = variant.label
      button.addEventListener('click', () => { void answer(variant.choice, button) })
      answers.appendChild(button)
    }
  }

  next.addEventListener('click', () => {
    index += 1
    if (index >= TOTAL) finish()
    else render()
  })

  async function load() {
    if (options.level !== 'session' || !options.participantId || !options.participantToken) {
      showError('Цю активність не вдалося відкрити. Скажи вчителю.')
      return
    }
    try {
      const loaded = await getSchoolFactOpinionStatements(options.participantId, options.participantToken)
      if (!Array.isArray(loaded.statements) || loaded.statements.length !== TOTAL) throw new Error('invalid pack')
      statements = shuffle(loaded.statements)
      options.onProgress?.(0, TOTAL)
      render()
    } catch {
      showError('Не вдалося завантажити твердження. Перевір інтернет і онови сторінку.')
    }
  }

  void load()

  return {
    snapshot: result,
    destroy() {
      finished = true
      container.textContent = ''
      container.classList.remove('fo-activity-root')
    },
  }
}
