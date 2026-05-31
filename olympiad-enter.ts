import { validateCode, exchangeCode } from './features/api/client.js'

// --- DOM ---
const stepCode     = document.getElementById('step-code')!
const stepRules    = document.getElementById('step-rules')!
const codeForm     = document.getElementById('code-form') as HTMLFormElement
const codeInput    = document.getElementById('code-input') as HTMLInputElement
const codeError    = document.getElementById('code-error')!
const codeSubmitBtn = document.getElementById('code-submit-btn') as HTMLButtonElement
const eventTitleEl = document.getElementById('event-title')!
const eventGradeEl = document.getElementById('event-grade')!
const agreeCheckbox = document.getElementById('agree-checkbox') as HTMLInputElement
const startBtn     = document.getElementById('start-btn') as HTMLButtonElement
const startError   = document.getElementById('start-error')!
const changeCodeBtn = document.getElementById('change-code-btn') as HTMLButtonElement

// Нормалізація: прибрати пробіли, латиниця → кирилиця, верхній регістр
const LATIN_TO_CYR: Record<string, string> = {
  A:'А', B:'В', C:'С', E:'Е', H:'Н', I:'І', K:'К', M:'М', O:'О', P:'Р', T:'Т', X:'Х',
  a:'а', b:'в', c:'с', e:'е', h:'н', i:'і', k:'к', m:'м', o:'о', p:'р', t:'т', x:'х',
}
function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase()
    .split('').map(ch => LATIN_TO_CYR[ch] ?? ch).join('')
    .replace(/\s+/g, '')
}

// Оновлення поля при введенні
codeInput.addEventListener('input', () => {
  codeInput.value = normalizeCode(codeInput.value)
  codeError.textContent = ''
})

// КРОК 1: перевірка коду
codeForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const code = normalizeCode(codeInput.value)
  if (!code) { codeError.textContent = 'Введи код.'; return }

  codeError.textContent    = ''
  codeSubmitBtn.disabled   = true
  codeSubmitBtn.textContent = 'Перевірка…'

  try {
    const { eventTitle, grade } = await validateCode(code)
    // Зберігаємо нормалізований код для exchange-code
    codeInput.dataset['normalized'] = code
    // Показуємо підтвердження і правила
    eventTitleEl.textContent = eventTitle
    eventGradeEl.textContent = `${grade} клас`
    stepCode.classList.add('hidden')
    stepRules.classList.remove('hidden')
    agreeCheckbox.checked = false
    startBtn.disabled = true
    startBtn.focus()
  } catch (err) {
    codeError.textContent    = (err as Error).message
    codeSubmitBtn.disabled   = false
    codeSubmitBtn.textContent = 'Перевірити код →'
  }
})

// КРОК 2: активація кнопки Почати при галочці
agreeCheckbox.addEventListener('change', () => {
  startBtn.disabled = !agreeCheckbox.checked
  if (agreeCheckbox.checked) startBtn.focus()
})

// КРОК 3: exchange-code + redirect
startBtn.addEventListener('click', async () => {
  const code = codeInput.dataset['normalized'] ?? ''
  if (!code || !agreeCheckbox.checked) return

  startBtn.disabled    = true
  startBtn.textContent = 'Завантаження…'
  startError.textContent = ''

  try {
    const result = await exchangeCode(code)
    sessionStorage.setItem('pendingOlympiad', JSON.stringify({
      attemptId:    result.attemptId,
      attemptToken: result.attemptToken,
      code,
      grade:        result.grade,
      questions:    result.questions,
      resumed:      result.resumed ?? false,
      answeredQuestionIds: result.answeredQuestionIds ?? [],
      remainingSeconds: result.remainingSeconds,
    }))
    // Якщо це відновлення раніше початої спроби (закрив вкладку / F5) —
    // коротко повідомляємо учня, щоб він не лякався.
    if (result.resumed) {
      startBtn.textContent = '↩️ Відновлюємо твою спробу…'
    }
    window.location.href = 'student.html'
  } catch (err) {
    startError.textContent = (err as Error).message
    startBtn.disabled      = false
    startBtn.textContent   = '🏁 Почати олімпіаду'
  }
})

// Повернутись до вводу коду
changeCodeBtn.addEventListener('click', () => {
  stepRules.classList.add('hidden')
  stepCode.classList.remove('hidden')
  codeInput.value = ''
  delete codeInput.dataset['normalized']
  codeSubmitBtn.disabled   = false
  codeSubmitBtn.textContent = 'Перевірити код →'
  codeInput.focus()
})
