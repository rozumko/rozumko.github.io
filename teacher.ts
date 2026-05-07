// TODO: додати типи HTMLInputElement/HTMLButtonElement до DOM-запитів при наступному рефакторингу
// @ts-nocheck
import {
  loginTeacher, logoutTeacher, getTeacherSession,
  createTeacherClass, createTeacherRegistration,
  getTeacherMe, generateCodes, getTeacherClasses, getTeacherCodes,
  getTeacherRegistrationEvents, getTeacherRegistrations, getTeacherResults,
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
const registrationGenerateSelect = document.getElementById('generate-registration')
const generateBtn      = document.getElementById('generate-btn')
const generateStatus   = document.getElementById('generate-status')
const copyAllBtn       = document.getElementById('copy-all-btn')
const resultsList      = document.getElementById('results-list')
const classForm        = document.getElementById('teacher-class-form')
const classNameInput   = document.getElementById('class-name')
const classGradeSelect = document.getElementById('class-grade')
const classSubmitBtn   = document.getElementById('class-submit-btn')
const classStatus      = document.getElementById('class-form-status')
const registrationForm = document.getElementById('registration-form')
const registrationClassSelect = document.getElementById('registration-class')
const registrationEventSelect = document.getElementById('registration-event')
const registrationCountInput  = document.getElementById('registration-count')
const registrationSubmitBtn   = document.getElementById('registration-submit-btn')
const registrationStatus      = document.getElementById('registration-form-status')
const classesList      = document.getElementById('classes-list')
const registrationsList = document.getElementById('registrations-list')

let teacherClasses = []
let registrationEvents = []
let teacherRegistrations = []

// --- Init ---
init()

async function init() {
  const session = getTeacherSession()
  if (session?.accessToken) {
    try {
      const me = await getTeacherMe()
      showDashboard(me.name || session.email)
      await Promise.all([loadRegistrationEvents(), loadClasses(), loadRegistrations(), loadCodes(), loadResults()])
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
    await Promise.all([loadRegistrationEvents(), loadClasses(), loadRegistrations(), loadCodes(), loadResults()])
  } catch (err) {
    loginError.textContent  = friendlyError(err.message)
    loginSubmitBtn.disabled = false
    loginSubmitBtn.textContent = 'Увійти'
  }
})

// --- Create class ---
classForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = classNameInput.value.trim()
  const grade = Number(classGradeSelect.value)
  if (!name) {
    classStatus.textContent = 'Введіть назву класу.'
    classStatus.className = 'generate-status generate-status--err'
    return
  }

  classSubmitBtn.disabled = true
  classSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Збереження…'
  classStatus.textContent = ''
  try {
    await createTeacherClass({ name, grade })
    classNameInput.value = ''
    classStatus.textContent = '✓ Клас додано'
    classStatus.className = 'generate-status generate-status--ok'
    await loadClasses()
  } catch (err) {
    classStatus.textContent = err.message
    classStatus.className = 'generate-status generate-status--err'
  } finally {
    classSubmitBtn.disabled = false
    classSubmitBtn.innerHTML = '<i class="fas fa-plus"></i> Додати клас'
  }
})

// --- Register class for event ---
registrationForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const classId = registrationClassSelect.value
  const eventId = registrationEventSelect.value
  const participantsCount = Math.min(100, Math.max(1, Number(registrationCountInput.value) || 1))
  if (!classId || !eventId) {
    registrationStatus.textContent = 'Оберіть клас і подію.'
    registrationStatus.className = 'generate-status generate-status--err'
    return
  }

  registrationSubmitBtn.disabled = true
  registrationSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Реєстрація…'
  registrationStatus.textContent = ''
  try {
    await createTeacherRegistration({ classId, eventId, participantsCount })
    registrationStatus.textContent = '✓ Клас зареєстровано'
    registrationStatus.className = 'generate-status generate-status--ok'
    await loadRegistrations()
  } catch (err) {
    registrationStatus.textContent = err.message
    registrationStatus.className = 'generate-status generate-status--err'
  } finally {
    registrationSubmitBtn.disabled = false
    registrationSubmitBtn.innerHTML = '<i class="fas fa-clipboard-check"></i> Зареєструвати'
  }
})

// --- Logout ---
logoutBtn.addEventListener('click', async () => {
  await logoutTeacher()
  showAuth()
})

// --- Generate codes ---
generateBtn.addEventListener('click', async () => {
  const registrationId = registrationGenerateSelect.value
  if (!registrationId) {
    generateStatus.textContent = 'Оберіть реєстрацію класу.'
    generateStatus.className = 'generate-status generate-status--err'
    return
  }
  generateBtn.disabled  = true
  generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Генерація…'
  generateStatus.textContent = ''
  try {
    const { codes } = await generateCodes({ registrationId, maxUses: 1 })
    generateStatus.textContent = `✓ Додано ${codes.length} кодів`
    generateStatus.className   = 'generate-status generate-status--ok'
    await Promise.all([loadCodes(), loadRegistrations()])
  } catch (err) {
    generateStatus.textContent = err.message
    generateStatus.className   = 'generate-status generate-status--err'
  } finally {
    generateBtn.disabled  = false
    generateBtn.innerHTML = '<i class="fas fa-key"></i> Згенерувати коди'
  }
})

async function loadRegistrationEvents() {
  try {
    const { events } = await getTeacherRegistrationEvents()
    registrationEvents = events
    renderRegistrationEventOptions()
  } catch {
    registrationEvents = []
    renderRegistrationEventOptions()
  }
}

async function loadClasses() {
  try {
    const { classes } = await getTeacherClasses()
    teacherClasses = classes
    renderClasses()
    renderRegistrationClassOptions()
  } catch (err) {
    classesList.innerHTML = `<p class="empty-state__sub" style="text-align:center;padding:var(--sp-4)">${esc(err.message)}</p>`
  }
}

async function loadRegistrations() {
  try {
    const { registrations } = await getTeacherRegistrations()
    teacherRegistrations = registrations
    renderRegistrations(registrations)
    renderGenerateRegistrationOptions()
  } catch (err) {
    registrationsList.innerHTML = `<p class="empty-state__sub" style="text-align:center;padding:var(--sp-4)">${esc(err.message)}</p>`
  }
}

function renderGenerateRegistrationOptions() {
  registrationGenerateSelect.innerHTML = ''
  const eligible = teacherRegistrations.filter(reg =>
    reg.status === 'registered' &&
    ['not_required', 'paid'].includes(reg.paymentStatus) &&
    Number(reg.codesCreatedCount ?? 0) < Number(reg.participantsCount)
  )
  if (!eligible.length) {
    registrationGenerateSelect.innerHTML = '<option value="">Немає реєстрацій для кодів</option>'
    registrationGenerateSelect.disabled = true
    generateBtn.disabled = true
    generateStatus.textContent = 'Спочатку зареєструйте клас на поточну подію.'
    generateStatus.className = 'generate-status generate-status--err'
    return
  }

  eligible.forEach(reg => {
    const opt = document.createElement('option')
    opt.value = reg.id
    opt.textContent = `${reg.className ?? 'Клас'} · ${reg.eventTitle ?? 'Подія'} · ${reg.codesCreatedCount ?? 0}/${reg.participantsCount} кодів`
    registrationGenerateSelect.appendChild(opt)
  })
  registrationGenerateSelect.disabled = false
  generateBtn.disabled = false
  generateStatus.textContent = ''
}

function renderRegistrationClassOptions() {
  registrationClassSelect.innerHTML = ''
  if (!teacherClasses.length) {
    registrationClassSelect.innerHTML = '<option value="">Створіть клас</option>'
    registrationClassSelect.disabled = true
    registrationSubmitBtn.disabled = true
    return
  }

  teacherClasses.forEach(cls => {
    const opt = document.createElement('option')
    opt.value = cls.id
    opt.textContent = `${cls.name} · ${cls.grade} клас`
    registrationClassSelect.appendChild(opt)
  })
  registrationClassSelect.disabled = false
  registrationSubmitBtn.disabled = !registrationEvents.length
}

function renderRegistrationEventOptions() {
  registrationEventSelect.innerHTML = ''
  if (!registrationEvents.length) {
    registrationEventSelect.innerHTML = '<option value="">Немає подій для реєстрації</option>'
    registrationEventSelect.disabled = true
    registrationSubmitBtn.disabled = true
    return
  }

  registrationEvents.forEach(event => {
    const opt = document.createElement('option')
    opt.value = event.id
    opt.textContent = event.title
    registrationEventSelect.appendChild(opt)
  })
  registrationEventSelect.disabled = false
  registrationSubmitBtn.disabled = !teacherClasses.length
}

function renderClasses() {
  if (!teacherClasses.length) {
    classesList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users empty-state__icon" aria-hidden="true"></i>
        <p class="empty-state__title">Класів ще немає</p>
        <p class="empty-state__sub">Додайте клас, щоб реєструвати учасників на події.</p>
      </div>`
    return
  }

  classesList.innerHTML = ''
  teacherClasses.forEach(cls => {
    const card = document.createElement('div')
    card.className = 'teacher-info-card'
    card.innerHTML = `
      <div>
        <p class="teacher-info-card__title">${esc(cls.name)}</p>
        <p class="teacher-info-card__meta">${esc(String(cls.grade))} клас</p>
      </div>`
    classesList.appendChild(card)
  })
}

function renderRegistrations(registrations) {
  if (!registrations.length) {
    registrationsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clipboard-list empty-state__icon" aria-hidden="true"></i>
        <p class="empty-state__title">Реєстрацій ще немає</p>
        <p class="empty-state__sub">Після реєстрації класу подія з'явиться тут.</p>
      </div>`
    return
  }

  registrationsList.innerHTML = ''
  registrations.forEach(reg => {
    const row = document.createElement('div')
    row.className = 'teacher-info-card'
    const codesCreatedCount = Number(reg.codesCreatedCount ?? 0)
    const participantsCount = Number(reg.participantsCount)
    const codeStatus = codesCreatedCount >= participantsCount
      ? 'коди створено'
      : `кодів ${codesCreatedCount}/${participantsCount}`
    row.innerHTML = `
      <div>
        <p class="teacher-info-card__title">${esc(reg.className ?? 'Клас')} · ${esc(reg.eventTitle ?? 'Подія')}</p>
        <p class="teacher-info-card__meta">${esc(String(reg.grade))} клас · ${esc(String(reg.participantsCount))} учасників · ${paymentLabel(reg.paymentStatus)}</p>
      </div>
      <span class="teacher-info-card__badge">${esc(reg.status)}</span>`
    row.querySelector('.teacher-info-card__meta')?.insertAdjacentText('beforeend', ` · ${codeStatus}`)
    registrationsList.appendChild(row)
  })
}

function paymentLabel(status) {
  const labels = {
    not_required: 'оплата не потрібна',
    pending: 'очікує оплату',
    paid: 'оплачено',
    failed: 'помилка оплати',
    refunded: 'повернено',
  }
  return labels[status] ?? status
}

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
        <span class="code-chip__meta">${esc(c.eventTitle ?? 'Олімпіада')} · ${esc(String(c.grade))} клас · використано ${esc(String(c.usedCount))}/${esc(String(c.maxUses))}</span>
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
