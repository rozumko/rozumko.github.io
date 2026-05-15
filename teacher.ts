import {
  loginTeacher, logoutTeacher, getTeacherSession, registerTeacher,
  createTeacherClass, createTeacherRegistration,
  getTeacherMe, generateCodes, getTeacherClasses, getTeacherCodes,
  getTeacherRegistrationEvents, getTeacherRegistrations, getTeacherResults,
  cancelTeacherRegistration,
  getClassStudents, addClassStudent, updateClassStudent, deleteClassStudent,
  type TeacherClass, type ClassStudent, type EventRegistration, type TeacherEvent, type Attempt,
} from './features/api/client.js'
import { esc, friendlyError } from './utils/ui.js'
import { $, $maybe } from './utils/dom.js'

// --- DOM ---
const authSection      = $('auth-section')
const dashboardSection = $('dashboard-section')
const loginForm        = $<HTMLFormElement>('teacher-login-form')
const loginError       = $('login-error')
const loginSubmitBtn   = $<HTMLButtonElement>('login-submit-btn')
const logoutBtn        = $<HTMLButtonElement>('logout-btn')
const teacherEmailDisplay = $('teacher-email-display')
const codesList        = $('codes-list')
const generateStatus   = $('generate-status')
const copyAllBtn       = $<HTMLButtonElement>('copy-all-btn')
const resultsList      = $('results-list')
const classesList      = $('classes-list')
const registrationsList = $('registrations-list')

// Форми — опціональні (можуть бути відсутні на певних версіях HTML)
const classForm        = $maybe<HTMLFormElement>('teacher-class-form')
const classNameInput   = $maybe<HTMLInputElement>('class-name')
const classGradeSelect = $maybe<HTMLSelectElement>('class-grade')
const classSubmitBtn   = $maybe<HTMLButtonElement>('class-submit-btn')
const classStatus      = $maybe('class-form-status')

const registrationForm          = $maybe<HTMLFormElement>('registration-form')
const registrationClassSelect   = $maybe<HTMLSelectElement>('registration-class')
const registrationEventSelect   = $maybe<HTMLSelectElement>('registration-event')
const registrationCountInput    = $maybe<HTMLInputElement>('registration-count')
const registrationSubmitBtn     = $maybe<HTMLButtonElement>('registration-submit-btn')
const registrationStatus        = $maybe('registration-form-status')
const registrationGenerateSelect = $maybe<HTMLSelectElement>('generate-registration')
const filterRegistrationSelect   = $maybe<HTMLSelectElement>('filter-registration')
const generateBtn               = $maybe<HTMLButtonElement>('generate-btn')

let teacherClasses: TeacherClass[] = []
let registrationEvents: TeacherEvent[] = []
let teacherRegistrations: EventRegistration[] = []

// --- Cold start banner ---
function showColdStartBanner() {
  let banner = document.getElementById('cold-start-banner')
  if (banner) return
  banner = document.createElement('div')
  banner.id        = 'cold-start-banner'
  banner.className = 'cold-start-banner'
  banner.innerHTML = `
    <span class="cold-start-banner__spinner"></span>
    <span>Сервер запускається… зазвичай займає до 30 секунд.</span>`
  document.body.appendChild(banner)
}
function hideColdStartBanner() {
  document.getElementById('cold-start-banner')?.remove()
}

// --- Init ---
init()

async function init() {
  const session = getTeacherSession()
  if (session?.accessToken) {
    showColdStartBanner()
    try {
      const me = await getTeacherMe()
      hideColdStartBanner()
      showDashboard(me.name || session.email)
      await Promise.all([loadRegistrationEvents(), loadClasses(), loadRegistrations(), loadCodes(), loadResults()])
    } catch {
      hideColdStartBanner()
      showAuth()
    }
  } else {
    showAuth()
  }
}

// --- Tabs ---
document.querySelectorAll<HTMLElement>('.teacher-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.teacher-tab').forEach(t => t.classList.remove('teacher-tab--active'))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'))
    tab.classList.add('teacher-tab--active')
    const tabName = tab.dataset['tab']
    if (tabName) $maybe(`tab-${tabName}`)?.classList.remove('hidden')
  })
})

// --- Login ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email    = $<HTMLInputElement>('login-email').value.trim()
  const password = $<HTMLInputElement>('login-password').value
  loginError.textContent     = ''
  loginSubmitBtn.disabled    = true
  loginSubmitBtn.textContent = 'Вхід…'
  showColdStartBanner()
  try {
    await loginTeacher(email, password)
    const me = await getTeacherMe()
    hideColdStartBanner()
    showDashboard(me.name || email)
    await Promise.all([loadRegistrationEvents(), loadClasses(), loadRegistrations(), loadCodes(), loadResults()])
  } catch (err) {
    hideColdStartBanner()
    loginError.textContent     = friendlyError((err as Error).message)
    loginSubmitBtn.disabled    = false
    loginSubmitBtn.textContent = 'Увійти'
  }
})

// --- Register mode toggle ---
const loginMode        = $maybe('login-mode')
const registerMode     = $maybe('register-mode')
const registerForm     = $maybe<HTMLFormElement>('teacher-register-form')
const registerError    = $maybe('register-error')
const registerSubmitBtn = $maybe<HTMLButtonElement>('register-submit-btn')
const authCardTitle    = $maybe('auth-card-title')
const authCardSub      = $maybe('auth-card-sub')

function switchToRegister() {
  loginMode?.classList.add('hidden')
  registerMode?.classList.remove('hidden')
  if (authCardTitle) authCardTitle.textContent = 'Реєстрація вчителя'
  if (authCardSub)   authCardSub.textContent   = 'Створіть кабінет для керування класами та результатами.'
  $maybe<HTMLInputElement>('reg-email')?.focus()
}

function switchToLogin() {
  registerMode?.classList.add('hidden')
  loginMode?.classList.remove('hidden')
  if (authCardTitle) authCardTitle.textContent = 'Вхід для вчителя'
  if (authCardSub)   authCardSub.textContent   = 'Увійдіть, щоб керувати класами, кодами та результатами.'
  $maybe<HTMLInputElement>('login-email')?.focus()
}

$maybe<HTMLButtonElement>('show-register-btn')?.addEventListener('click', switchToRegister)
$maybe<HTMLButtonElement>('hide-register-btn')?.addEventListener('click', switchToLogin)

registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email    = $maybe<HTMLInputElement>('reg-email')?.value.trim() ?? ''
  const school   = $maybe<HTMLInputElement>('reg-school')?.value.trim() ?? ''
  const password = $maybe<HTMLInputElement>('reg-password')?.value ?? ''
  if (!email || !password) return
  if (registerError) registerError.textContent = ''
  registerSubmitBtn!.disabled    = true
  registerSubmitBtn!.textContent = 'Реєстрація…'
  showColdStartBanner()
  try {
    await registerTeacher(email, password, school)
    // Спробуємо одразу увійти (якщо підтвердження email не потрібне)
    try {
      const me = await getTeacherMe()
      hideColdStartBanner()
      showDashboard(me.name || email)
      await Promise.all([loadRegistrationEvents(), loadClasses(), loadRegistrations(), loadCodes(), loadResults()])
    } catch {
      hideColdStartBanner()
      // Email-підтвердження включено — показуємо підказку і переводимо до входу
      if (registerError) {
        registerError.textContent = '✅ Реєстрацію надіслано! Перевірте пошту та підтвердіть email, потім увійдіть.'
        registerError.style.color = 'var(--clr-emerald, #059669)'
      }
      registerSubmitBtn!.disabled    = false
      registerSubmitBtn!.textContent = 'Створити кабінет'
    }
  } catch (err) {
    hideColdStartBanner()
    if (registerError) registerError.textContent = friendlyError((err as Error).message)
    registerSubmitBtn!.disabled    = false
    registerSubmitBtn!.textContent = 'Створити кабінет'
  }
})

// --- Create class ---
classForm?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name  = classNameInput!.value.trim()
  const grade = Number(classGradeSelect!.value)
  if (!name) {
    classStatus!.textContent = 'Введіть назву класу.'
    classStatus!.className   = 'generate-status generate-status--err'
    return
  }
  classSubmitBtn!.disabled   = true
  classSubmitBtn!.innerHTML  = '<i class="fas fa-spinner fa-spin"></i> Збереження…'
  classStatus!.textContent   = ''
  try {
    await createTeacherClass({ name, grade })
    classNameInput!.value    = ''
    classStatus!.textContent = '✓ Клас додано'
    classStatus!.className   = 'generate-status generate-status--ok'
    await loadClasses()
  } catch (err) {
    classStatus!.textContent = (err as Error).message
    classStatus!.className   = 'generate-status generate-status--err'
  } finally {
    classSubmitBtn!.disabled  = false
    classSubmitBtn!.innerHTML = '<i class="fas fa-plus"></i> Додати клас'
  }
})

// --- Register class for event ---
registrationForm?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const classId           = registrationClassSelect!.value
  const eventId           = registrationEventSelect!.value
  const participantsCount = Math.min(100, Math.max(1, Number(registrationCountInput!.value) || 1))
  if (!classId || !eventId) {
    registrationStatus!.textContent = 'Оберіть клас і подію.'
    registrationStatus!.className   = 'generate-status generate-status--err'
    return
  }
  registrationSubmitBtn!.disabled  = true
  registrationSubmitBtn!.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Реєстрація…'
  registrationStatus!.textContent  = ''
  try {
    await createTeacherRegistration({ classId, eventId, participantsCount })
    registrationStatus!.textContent = '✓ Клас зареєстровано'
    registrationStatus!.className   = 'generate-status generate-status--ok'
    await loadRegistrations()
  } catch (err) {
    registrationStatus!.textContent = (err as Error).message
    registrationStatus!.className   = 'generate-status generate-status--err'
  } finally {
    registrationSubmitBtn!.disabled  = false
    registrationSubmitBtn!.innerHTML = '<i class="fas fa-clipboard-check"></i> Зареєструвати'
  }
})

// --- Logout ---
logoutBtn.addEventListener('click', async () => {
  await logoutTeacher()
  showAuth()
})

// --- Generate codes ---
generateBtn?.addEventListener('click', async () => {
  const registrationId = registrationGenerateSelect!.value
  if (!registrationId) {
    generateStatus.textContent = 'Оберіть реєстрацію класу.'
    generateStatus.className   = 'generate-status generate-status--err'
    return
  }
  generateBtn!.disabled  = true
  generateBtn!.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Генерація…'
  generateStatus.textContent = ''
  try {
    const { codes } = await generateCodes({ registrationId, maxUses: 1 })
    generateStatus.textContent = `✓ Додано ${codes.length} кодів`
    generateStatus.className   = 'generate-status generate-status--ok'
    await Promise.all([loadCodes(currentFilterRegId()), loadRegistrations()])
  } catch (err) {
    generateStatus.textContent = (err as Error).message
    generateStatus.className   = 'generate-status generate-status--err'
  } finally {
    generateBtn!.disabled  = false
    generateBtn!.innerHTML = '<i class="fas fa-key"></i> Згенерувати коди'
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
    classesList.innerHTML = `<p class="empty-state__sub" style="text-align:center;padding:var(--sp-4)">${esc((err as Error).message)}</p>`
  }
}

async function loadRegistrations() {
  try {
    const { registrations } = await getTeacherRegistrations()
    teacherRegistrations = registrations
    renderRegistrations(registrations)
    renderGenerateRegistrationOptions()
    renderFilterRegistrationOptions()
  } catch (err) {
    registrationsList.innerHTML = `<p class="empty-state__sub" style="text-align:center;padding:var(--sp-4)">${esc((err as Error).message)}</p>`
  }
}

function renderFilterRegistrationOptions() {
  if (!filterRegistrationSelect) return
  const prev = filterRegistrationSelect.value
  filterRegistrationSelect.innerHTML = '<option value="">Всі реєстрації</option>'
  // Тільки активні реєстрації (не скасовані)
  teacherRegistrations
    .filter(reg => reg.status !== 'cancelled')
    .forEach(reg => {
      const opt = document.createElement('option')
      opt.value       = reg.id
      opt.textContent = `${reg.className ?? 'Клас'} · ${reg.eventTitle ?? 'Подія'}`
      filterRegistrationSelect!.appendChild(opt)
    })
  // Зберегти попередній вибір тільки якщо реєстрація ще існує та активна
  const stillValid = [...filterRegistrationSelect.options].some(o => o.value === prev)
  filterRegistrationSelect.value = stillValid ? prev : ''
}

function renderGenerateRegistrationOptions() {
  if (!registrationGenerateSelect) return
  registrationGenerateSelect.innerHTML = ''
  const eligible = teacherRegistrations.filter(reg =>
    reg.status === 'registered' &&
    ['not_required', 'paid'].includes(reg.paymentStatus) &&
    Number(reg.codesCreatedCount ?? 0) < Number(reg.participantsCount)
  )
  if (!eligible.length) {
    registrationGenerateSelect.innerHTML = '<option value="">Немає активних реєстрацій</option>'
    registrationGenerateSelect.disabled  = true
    if (generateBtn) generateBtn.disabled = true
    // Показати конкретну причину
    const hasRegs = teacherRegistrations.length > 0
    if (hasRegs) {
      const pendingPayment = teacherRegistrations.some(r => r.paymentStatus === 'pending')
      generateStatus.textContent = pendingPayment
        ? '⏳ Очікується підтвердження оплати. Зверніться до організатора олімпіади.'
        : '✅ Всі коди для поточних реєстрацій вже згенеровані.'
    } else {
      generateStatus.textContent = 'ℹ️ Спочатку зареєструйте клас на активну подію.'
    }
    generateStatus.className = 'generate-status generate-status--info'
    return
  }
  eligible.forEach(reg => {
    const opt = document.createElement('option')
    opt.value       = reg.id
    opt.textContent = `${reg.className ?? 'Клас'} · ${reg.eventTitle ?? 'Подія'} · ${reg.codesCreatedCount ?? 0}/${reg.participantsCount} кодів`
    registrationGenerateSelect!.appendChild(opt)
  })
  registrationGenerateSelect.disabled = false
  if (generateBtn) generateBtn.disabled = false
  generateStatus.textContent = ''
}

function renderRegistrationClassOptions() {
  if (!registrationClassSelect) return
  registrationClassSelect.innerHTML = ''
  if (!teacherClasses.length) {
    registrationClassSelect.innerHTML = '<option value="">Створіть клас</option>'
    registrationClassSelect.disabled  = true
    if (registrationSubmitBtn) registrationSubmitBtn.disabled = true
    return
  }
  teacherClasses.forEach(cls => {
    const opt = document.createElement('option')
    opt.value       = cls.id
    opt.textContent = `${cls.name} · ${cls.grade} клас`
    registrationClassSelect!.appendChild(opt)
  })
  registrationClassSelect.disabled = false
  if (registrationSubmitBtn) registrationSubmitBtn.disabled = !registrationEvents.length
}

function renderRegistrationEventOptions() {
  if (!registrationEventSelect) return
  registrationEventSelect.innerHTML = ''
  if (!registrationEvents.length) {
    registrationEventSelect.innerHTML = '<option value="">Немає опублікованих подій</option>'
    registrationEventSelect.disabled  = true
    if (registrationSubmitBtn) registrationSubmitBtn.disabled = true
    // Підказка: адмін має опублікувати подію
    if (registrationStatus) {
      registrationStatus.textContent = 'ℹ️ Адміністратор ще не опублікував жодної події. Зверніться до організатора олімпіади.'
      registrationStatus.className   = 'generate-status generate-status--info'
    }
    return
  }
  registrationEvents.forEach(event => {
    const opt = document.createElement('option')
    opt.value       = event.id
    opt.textContent = event.title
    registrationEventSelect!.appendChild(opt)
  })
  registrationEventSelect.disabled = false
  if (registrationSubmitBtn) registrationSubmitBtn.disabled = !teacherClasses.length
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
    card.className = 'teacher-info-card teacher-info-card--clickable'
    card.innerHTML = `
      <div>
        <p class="teacher-info-card__title">${esc(cls.name)}</p>
        <p class="teacher-info-card__meta">${esc(String(cls.grade))} клас</p>
      </div>
      <button class="btn-class-open btn-adm-slate btn-sm" data-class-id="${esc(cls.id)}" data-class-name="${esc(cls.name)}" data-class-grade="${esc(String(cls.grade))}">
        <i class="fas fa-users" aria-hidden="true"></i> Учні
      </button>`
    const openBtn = card.querySelector<HTMLButtonElement>('.btn-class-open')!
    openBtn.addEventListener('click', () => openClassDetail(cls, openBtn))
    classesList.appendChild(card)
  })
}

// ─── Class detail panel ───────────────────────────────────────────────────

let classDetailPanel: HTMLElement | null = null
let classDetailOpener: HTMLElement | null = null  // для повернення фокусу

function openClassDetail(cls: TeacherClass, opener?: HTMLElement) {
  closeClassDetail()
  classDetailOpener = opener ?? null

  const panel = document.createElement('div')
  panel.id              = 'class-detail-panel'
  panel.className       = 'class-detail-overlay'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-labelledby', 'class-detail-title')
  panel.innerHTML = `<div class="class-detail-panel">
    <div class="class-detail-panel__head">
      <div>
        <p class="class-detail-panel__eyebrow">${esc(String(cls.grade))} клас</p>
        <h3 class="class-detail-panel__title" id="class-detail-title">${esc(cls.name)}</h3>
      </div>
      <button id="class-detail-close" class="btn-adm-slate btn-sm" aria-label="Закрити">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    <p class="class-detail-panel__hint">
      <i class="fas fa-info-circle" aria-hidden="true"></i>
      Введіть довільну мітку — наприклад <strong>«Маша К.»</strong>, <strong>«Учень 5»</strong>.
      Повні прізвища не зберігайте — для сертифіката ім'я вводиться окремо перед друком.
    </p>

    <form id="add-student-form" class="class-detail-panel__add-form" novalidate>
      <input id="student-label-input" type="text" maxlength="60"
        placeholder="Маша К., Учень 5, …" class="form-input" autocomplete="off" />
      <button type="submit" class="btn-adm-emerald btn-sm">
        <i class="fas fa-plus" aria-hidden="true"></i> Додати
      </button>
    </form>
    <p id="add-student-status" class="generate-status" style="margin-top:var(--sp-2)"></p>

    <div id="students-list" class="students-list">
      <p class="admin-loading-text">Завантаження…</p>
    </div>
  </div>`

  document.body.appendChild(panel)
  classDetailPanel = panel

  panel.querySelector<HTMLButtonElement>('#class-detail-close')!
    .addEventListener('click', closeClassDetail)

  panel.querySelector<HTMLFormElement>('#add-student-form')!
    .addEventListener('submit', async (e) => {
      e.preventDefault()
      const input  = panel.querySelector<HTMLInputElement>('#student-label-input')!
      const status = panel.querySelector<HTMLElement>('#add-student-status')!
      const label  = input.value.trim()
      if (!label) { input.focus(); return }

      const btn = panel.querySelector<HTMLButtonElement>('#add-student-form button[type="submit"]')!
      btn.disabled = true
      status.textContent = ''
      try {
        await addClassStudent(cls.id, label)
        input.value = ''
        input.focus()
        await reloadStudentsList(cls.id)
      } catch (err) {
        status.textContent = (err as Error).message
        status.className   = 'generate-status generate-status--err'
      } finally {
        btn.disabled = false
      }
    })

  // Закрити по кліку на overlay (поза sidebar)
  panel.addEventListener('click', (e) => { if (e.target === panel) closeClassDetail() })
  // Закрити по Escape
  document.addEventListener('keydown', handleDetailEsc)

  reloadStudentsList(cls.id)

  // Затримка для анімації, потім переводимо фокус усередину
  requestAnimationFrame(() => {
    panel.classList.add('class-detail-overlay--open')
    const firstFocusable = panel.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    firstFocusable?.focus()
  })
}

function closeClassDetail() {
  document.removeEventListener('keydown', handleDetailEsc)
  if (classDetailPanel) {
    classDetailPanel.remove()
    classDetailPanel = null
  }
  // Повертаємо фокус на кнопку що відкрила панель
  classDetailOpener?.focus()
  classDetailOpener = null
}

function handleDetailEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') closeClassDetail()
}

async function reloadStudentsList(classId: string) {
  const container = document.getElementById('students-list')
  if (!container) return
  container.innerHTML = '<p class="admin-loading-text">Завантаження…</p>'
  try {
    const { students } = await getClassStudents(classId)
    renderStudentsList(container, classId, students)
  } catch (err) {
    container.innerHTML = `<p class="generate-status generate-status--err">${esc((err as Error).message)}</p>`
  }
}

function renderStudentsList(container: HTMLElement, classId: string, students: ClassStudent[]) {
  if (!students.length) {
    container.innerHTML = `
      <div class="students-list__empty">
        <i class="fas fa-user-plus" aria-hidden="true"></i>
        <p>Учнів ще немає. Додайте першого за допомогою форми вище.</p>
      </div>`
    return
  }
  container.innerHTML = ''
  students.forEach((s, i) => {
    const row = document.createElement('div')
    row.className = 'student-row'
    row.dataset['id'] = s.id
    row.innerHTML = `
      <span class="student-row__num">${i + 1}</span>
      <span class="student-row__label" title="${esc(s.label)}">${esc(s.label)}</span>
      <div class="student-row__actions">
        <button class="btn-student-edit btn-adm-slate btn-sm" aria-label="Редагувати">
          <i class="fas fa-pencil-alt" aria-hidden="true"></i>
        </button>
        <button class="btn-student-delete btn-adm-danger btn-sm" aria-label="Видалити">
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
      </div>`

    row.querySelector<HTMLButtonElement>('.btn-student-edit')!
      .addEventListener('click', () => startEditStudent(row, s, classId))

    row.querySelector<HTMLButtonElement>('.btn-student-delete')!
      .addEventListener('click', async () => {
        if (!confirm(`Видалити «${s.label}» зі списку?`)) return
        try {
          await deleteClassStudent(s.id)
          await reloadStudentsList(classId)
        } catch (err) {
          const status = document.getElementById('add-student-status')
          if (status) { status.textContent = (err as Error).message; status.className = 'generate-status generate-status--err' }
        }
      })

    container.appendChild(row)
  })
}

function startEditStudent(row: HTMLElement, s: ClassStudent, classId: string) {
  // Замінюємо label на inline input
  const labelEl = row.querySelector<HTMLElement>('.student-row__label')!
  const actionsEl = row.querySelector<HTMLElement>('.student-row__actions')!
  const originalLabel = s.label

  labelEl.innerHTML = `<input class="student-edit-input form-input" value="${esc(s.label)}" maxlength="60" />`
  actionsEl.innerHTML = `
    <button class="btn-student-save btn-adm-emerald btn-sm" aria-label="Зберегти"><i class="fas fa-check" aria-hidden="true"></i></button>
    <button class="btn-student-cancel btn-adm-slate btn-sm" aria-label="Скасувати редагування"><i class="fas fa-times" aria-hidden="true"></i></button>`

  const input = labelEl.querySelector<HTMLInputElement>('.student-edit-input')!
  input.focus()
  input.select()

  const save = async () => {
    const newLabel = input.value.trim()
    if (!newLabel) { input.focus(); return }
    try {
      await updateClassStudent(s.id, newLabel)
      await reloadStudentsList(classId)
    } catch (err) {
      const status = document.getElementById('add-student-status')
      if (status) { status.textContent = (err as Error).message; status.className = 'generate-status generate-status--err' }
    }
  }

  actionsEl.querySelector<HTMLButtonElement>('.btn-student-save')!.addEventListener('click', save)
  actionsEl.querySelector<HTMLButtonElement>('.btn-student-cancel')!.addEventListener('click', () => {
    reloadStudentsList(classId)
  })
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') { s.label = originalLabel; reloadStudentsList(classId) }
  })
}

function renderRegistrations(registrations: EventRegistration[]) {
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

    const isCancellable = reg.status === 'registered'
    row.innerHTML = `
      <div style="flex:1;min-width:0">
        <p class="teacher-info-card__title">${esc(reg.className ?? 'Клас')} · ${esc(reg.eventTitle ?? 'Подія')}</p>
        <p class="teacher-info-card__meta">${esc(String(reg.grade))} клас · ${esc(String(reg.participantsCount))} учасників · ${paymentLabel(reg.paymentStatus)} · ${codeStatus}</p>
      </div>
      <div style="display:flex;align-items:center;gap:var(--sp-2);flex-shrink:0">
        <span class="teacher-info-card__badge">${reg.status === 'cancelled' ? '❌ Скасовано' : esc(reg.status)}</span>
        ${isCancellable ? `<button class="btn-cancel-reg btn-adm-danger btn-sm" data-id="${esc(reg.id)}" aria-label="Скасувати реєстрацію">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>` : ''}
      </div>`
    registrationsList.appendChild(row)
  })

  // Обробник скасування — inline підтвердження без confirm()
  registrationsList.querySelectorAll<HTMLButtonElement>('.btn-cancel-reg').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.teacher-info-card')!
      // Якщо вже є рядок підтвердження — не дублюємо
      if (card.querySelector('.cancel-confirm-row')) return

      const row = document.createElement('div')
      row.className = 'cancel-confirm-row'
      row.style.cssText = 'display:flex;align-items:center;gap:var(--sp-2);margin-top:var(--sp-2);flex-wrap:wrap'
      row.innerHTML = `
        <span style="font-size:var(--font-size-sm);color:var(--clr-text-muted)">Скасувати? Невикористані коди буде видалено.</span>
        <button class="btn-cancel-confirm btn-adm-danger btn-sm">Так, скасувати</button>
        <button class="btn-cancel-abort btn-secondary btn-sm">Ні</button>`
      card.appendChild(row)

      row.querySelector('.btn-cancel-abort')!.addEventListener('click', () => row.remove())
      row.querySelector<HTMLButtonElement>('.btn-cancel-confirm')!.addEventListener('click', async () => {
        const confirmBtn = row.querySelector<HTMLButtonElement>('.btn-cancel-confirm')!
        confirmBtn.disabled = true
        confirmBtn.textContent = 'Скасовую…'
        try {
          await cancelTeacherRegistration(btn.dataset.id!)
          await Promise.all([loadRegistrations(), loadCodes(currentFilterRegId())])
        } catch (err) {
          confirmBtn.disabled = false
          confirmBtn.textContent = 'Так, скасувати'
          const msg = document.createElement('span')
          msg.style.cssText = 'color:#dc2626;font-size:var(--font-size-xs)'
          msg.textContent = (err as Error).message
          row.appendChild(msg)
        }
      })
    })
  })
}

function paymentLabel(status: string): string {
  const labels: Record<string, string> = {
    not_required: '🎉 Безкоштовно (пілот)',
    pending:      '⏳ Очікує оплату батьків',
    paid:         '✅ Оплачено',
    failed:       '❌ Помилка оплати',
    refunded:     '↩️ Повернено',
  }
  return labels[status] ?? status
}

// --- Copy all ---
copyAllBtn.addEventListener('click', () => {
  const text = [...codesList.querySelectorAll('.code-chip__value')]
    .map(el => el.textContent).join('\n')
  navigator.clipboard.writeText(text).then(() => {
    copyAllBtn.textContent = '✓ Скопійовано'
    setTimeout(() => { copyAllBtn.innerHTML = '<i class="fas fa-copy"></i> Копіювати всі' }, 2000)
  })
})

// Поточне значення фільтра кодів
function currentFilterRegId(): string | undefined {
  return filterRegistrationSelect?.value || undefined
}

// --- Load codes ---
async function loadCodes(registrationId?: string) {
  const { codes } = await getTeacherCodes(registrationId)
  if (!codes.length) {
    codesList.innerHTML = '<p class="empty-state__sub" style="text-align:center;padding:var(--sp-4)">Кодів немає для цієї реєстрації.</p>'
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
        <span class="code-chip__meta">${esc((c as any).eventTitle ?? 'Олімпіада')} · ${esc(String(c.grade))} клас · використано ${esc(String(c.usedCount))}/${esc(String(c.maxUses))}</span>
      </div>`
    codesList.appendChild(chip)
  })
  copyAllBtn.classList.remove('hidden')
}

// Фільтр кодів за реєстрацією
filterRegistrationSelect?.addEventListener('change', () => {
  const regId = filterRegistrationSelect.value || undefined
  loadCodes(regId)
})

// --- Load results ---
async function loadResults() {
  try {
    const { results } = await getTeacherResults()
    if (!results.length) return
    resultsList.innerHTML = ''
    results.forEach((r: Attempt & { accessCode?: { code: string; grade: number } }) => {
      const code  = r.accessCode?.code  ?? r.code ?? r.id
      const grade = r.accessCode?.grade ?? r.grade
      const date  = r.finishedAt ? new Date(r.finishedAt).toLocaleDateString('uk-UA') : ''
      const row   = document.createElement('div')
      row.className = 'result-row'
      row.innerHTML = `
        <div>
          <p class="result-row__code">${esc(String(code))}</p>
          <p class="result-row__meta">${esc(String(grade))} клас</p>
        </div>
        <div class="result-row__score-wrap">
          <p class="result-row__score">${esc(String(r.score ?? '?'))}<span class="result-row__total">/${esc(String(r.totalQ ?? '?'))}</span></p>
          <p class="result-row__time">${esc(date)}</p>
        </div>`
      resultsList.appendChild(row)
    })
  } catch {
    // результатів ще немає
  }
}

// --- Show/hide ---
function showDashboard(nameOrEmail: string) {
  authSection.classList.add('hidden')
  dashboardSection.classList.remove('hidden')
  teacherEmailDisplay.textContent = nameOrEmail
  ;(teacherEmailDisplay as HTMLElement).style.display = ''
  document.body.classList.add('teacher-dashboard-active')
  $maybe('auth-back-link')?.classList.add('hidden')
}

function showAuth() {
  dashboardSection.classList.add('hidden')
  authSection.classList.remove('hidden')
  document.body.classList.remove('teacher-dashboard-active')
  $maybe('auth-back-link')?.classList.remove('hidden')
  loginSubmitBtn.disabled    = false
  loginSubmitBtn.textContent = 'Увійти'
}
