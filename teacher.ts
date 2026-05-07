// TODO: додати типи HTMLInputElement/HTMLButtonElement до DOM-запитів при наступному рефакторингу
// @ts-nocheck
import {
  loginTeacher, logoutTeacher, getTeacherSession,
  getTeacherMe, generateCodes, getTeacherCodes, getTeacherResults,
} from './features/api/client.js'
import { esc, friendlyError } from './utils/ui.js'

// --- DOM ---
const authSection      = document.getElementById('auth-section')
const dashboardSection = document.getElementById('dashboard-section')
const loginForm        = document.getElementById('teacher-login-form')
const loginError       = document.getElementById('login-error')
const loginSubmitBtn   = document.getElementById('login-submit-btn')
const logoutBtn        = document.getElementById('logout-btn')
const teacherEmailDisplay = document.getElementById('teacher-email-display')
const codesList        = document.getElementById('codes-list')
const gradeSelect      = document.getElementById('generate-grade')
const countInput       = document.getElementById('generate-count')
const generateBtn      = document.getElementById('generate-btn')
const generateStatus   = document.getElementById('generate-status')
const copyAllBtn       = document.getElementById('copy-all-btn')
const resultsList      = document.getElementById('results-list')

// --- Init ---
init()

async function init() {
  const session = getTeacherSession()
  if (session?.accessToken) {
    try {
      const me = await getTeacherMe()
      showDashboard(me.name || session.email)
      await Promise.all([loadCodes(), loadResults()])
    } catch {
      showAuth()
    }
  } else {
    showAuth()
  }
}

// --- Tabs ---
document.querySelectorAll('.teacher-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.teacher-tab').forEach(t => t.classList.remove('teacher-tab--active'))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'))
    tab.classList.add('teacher-tab--active')
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden')
  })
})

// --- Login ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email    = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  loginError.textContent  = ''
  loginSubmitBtn.disabled = true
  loginSubmitBtn.textContent = 'Вхід…'
  try {
    await loginTeacher(email, password)
    const me = await getTeacherMe()
    showDashboard(me.name || email)
    await Promise.all([loadCodes(), loadResults()])
  } catch (err) {
    loginError.textContent  = friendlyError(err.message)
    loginSubmitBtn.disabled = false
    loginSubmitBtn.textContent = 'Увійти'
  }
})

// --- Logout ---
logoutBtn.addEventListener('click', async () => {
  await logoutTeacher()
  showAuth()
})

// --- Generate codes ---
generateBtn.addEventListener('click', async () => {
  const grade = Number(gradeSelect.value)
  const count = Math.min(40, Math.max(1, Number(countInput.value) || 1))
  generateBtn.disabled  = true
  generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Генерація…'
  generateStatus.textContent = ''
  try {
    const { codes } = await generateCodes({ grade, count, maxUses: 1 })
    generateStatus.textContent = `✓ Додано ${codes.length} кодів`
    generateStatus.className   = 'generate-status generate-status--ok'
    await loadCodes()
  } catch (err) {
    generateStatus.textContent = err.message
    generateStatus.className   = 'generate-status generate-status--err'
  } finally {
    generateBtn.disabled  = false
    generateBtn.innerHTML = '<i class="fas fa-key"></i> Згенерувати коди'
  }
})

// --- Copy all ---
copyAllBtn.addEventListener('click', () => {
  const text = [...codesList.querySelectorAll('.code-chip__value')].map(el => el.textContent).join('\n')
  navigator.clipboard.writeText(text).then(() => {
    copyAllBtn.textContent = '✓ Скопійовано'
    setTimeout(() => { copyAllBtn.innerHTML = '<i class="fas fa-copy"></i> Копіювати всі' }, 2000)
  })
})

// --- Load codes ---
async function loadCodes() {
  const { codes } = await getTeacherCodes()
  if (!codes.length) {
    codesList.innerHTML = '<p class="empty-state__sub" style="text-align:center;padding:var(--sp-4)">Кодів ще немає. Згенеруй перші коди.</p>'
    copyAllBtn.classList.add('hidden')
    return
  }
  codesList.innerHTML = ''
  codes.forEach(c => {
    const chip = document.createElement('div')
    chip.className = 'code-chip'
    chip.innerHTML = `
      <div class="code-chip__row">
        <span class="code-value code-chip__value">${esc(c.code)}</span>
        <span class="code-chip__meta">${esc(String(c.grade))} клас · використано ${esc(String(c.usedCount))}/${esc(String(c.maxUses))}</span>
      </div>`
    codesList.appendChild(chip)
  })
  copyAllBtn.classList.remove('hidden')
}

// --- Load results ---
async function loadResults() {
  try {
    const { results } = await getTeacherResults()
    if (!results.length) return
    resultsList.innerHTML = ''
    results.forEach(r => {
      const code  = r.accessCode?.code  ?? r.codeId
      const grade = r.accessCode?.grade ?? '?'
      const date  = r.finishedAt ? new Date(r.finishedAt).toLocaleDateString('uk-UA') : ''
      const row   = document.createElement('div')
      row.className = 'result-row'
      row.innerHTML = `
        <div>
          <p class="result-row__code">${esc(String(code))}</p>
          <p class="result-row__meta">${esc(String(grade))} клас</p>
        </div>
        <div class="result-row__score-wrap">
          <p class="result-row__score">${esc(String(r.score ?? '?'))}<span class="result-row__total">/${esc(String(r.total ?? '?'))}</span></p>
          <p class="result-row__time">${esc(date)}</p>
        </div>`
      resultsList.appendChild(row)
    })
  } catch {
    // результатів ще немає
  }
}

// --- Show/hide ---
function showDashboard(nameOrEmail) {
  authSection.classList.add('hidden')
  dashboardSection.classList.remove('hidden')
  teacherEmailDisplay.textContent = nameOrEmail
  teacherEmailDisplay.style.display = ''
  document.body.classList.add('teacher-dashboard-active')
  document.getElementById('auth-back-link')?.classList.add('hidden')
}

function showAuth() {
  dashboardSection.classList.add('hidden')
  authSection.classList.remove('hidden')
  document.body.classList.remove('teacher-dashboard-active')
  document.getElementById('auth-back-link')?.classList.remove('hidden')
  loginSubmitBtn.disabled    = false
  loginSubmitBtn.textContent = 'Увійти'
}
