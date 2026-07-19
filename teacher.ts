import './frontend-security.js'
import './register-sw.js'
import {
  loginTeacher, logoutTeacher, getTeacherSession, storeTeacherSession, registerTeacher,
  createTeacherClass, createTeacherRegistration,
  getTeacherMe, generateCodes, getTeacherClasses, getTeacherCodes,
  getTeacherRegistrationEvents, getTeacherRegistrations, getTeacherResults,
  cancelTeacherRegistration,
  requestPasswordReset, updateAuthPassword, googleSignInUrl, exchangeAuthCode, registerTeacherRequest,
  getClassStudents, addClassStudent, updateClassStudent, deleteClassStudent,
  createSchoolSession, startSchoolSession, finishSchoolSession, getSchoolSession,
  getSchoolSessionQuestions, submitSchoolProjectorAnswer, getSchoolParticipantAnswers,
  type SchoolParticipantAnswer,
  TURNSTILE_SITE_KEY,
  type TeacherClass, type ClassStudent, type EventRegistration, type TeacherEvent, type Attempt,
  type SchoolSessionInfo, type Question,
} from './features/api/client.js'
import { esc, friendlyError, recoveryErrorMessage, showConfirm, showModal } from './utils/ui.js'
import { openCertModal, awardLabel, percent, getAward } from './utils/certificate.js'
import { TOPICS_BY_TRACK, TOPIC_LABELS } from './features/missions/topics.js'
import type { SchoolTopicStat } from './features/api/client.js'
import { runMission, type MissionElements } from './features/missions/mission-runner.js'
import { createFocusTrap } from './utils/focus-trap.js'

// Header label next to the logout button: always contains the email so the
// user can tell which account is signed in (Google sign-in has no local email).
function teacherLabel(me: { name?: string | null; email?: string }, fallbackEmail: string): string {
  const email = me.email || fallbackEmail
  return me.name && email ? `${me.name} · ${email}` : (email || me.name || '')
}

function isPendingError(err: unknown): boolean {
  const apiErr = err as { code?: string; message?: string }
  const msg = apiErr.message ?? ''
  return apiErr.code === 'ACCOUNT_PENDING'
    || msg.includes('ACCOUNT_PENDING')
    || msg.includes('очікує підтвердження')
    || msg.includes('ще не підтверджено')
}

// Valid Supabase user without an app_users row: the backend no longer
// auto-provisions, the teacher cabinet is requested explicitly.
function isUnknownAccountError(err: unknown): boolean {
  const apiErr = err as { code?: string; message?: string }
  return apiErr.code === 'ACCOUNT_UNKNOWN'
    || (apiErr.message ?? '').includes('ще не створено')
}

const PENDING_CREATED_MSG = '✅ Заявку подано! Кабінет очікує підтвердження адміністратора — після підтвердження увійдіть ще раз.'

function showRegisterRequestBox() {
  $maybe('register-request-box')?.classList.remove('hidden')
}

function hideRegisterRequestBox() {
  $maybe('register-request-box')?.classList.add('hidden')
}
import { $, $maybe } from './utils/dom.js'
import { avatarSrc, avatarLabel } from './avatars.js'

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
let olympiadLoaded = false
let olympiadLoading: Promise<void> | null = null

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

const TEACHER_CALLBACK_FLOW_KEY = 'rozumko_teacher_callback_flow'
const TEACHER_AUTH_MODE_KEY = 'rozumko_teacher_auth_mode'

function readTeacherCallbackFlow(): 'signup' | 'recovery' | null {
  try {
    const value = sessionStorage.getItem(TEACHER_CALLBACK_FLOW_KEY)
    return value === 'signup' || value === 'recovery' ? value : null
  } catch {
    return null
  }
}

function clearTeacherCallbackFlow(): void {
  try { sessionStorage.removeItem(TEACHER_CALLBACK_FLOW_KEY) } catch { /* unavailable */ }
}

function takeTeacherAuthMode(): 'register' | 'forgot' | null {
  try {
    const mode = sessionStorage.getItem(TEACHER_AUTH_MODE_KEY)
    sessionStorage.removeItem(TEACHER_AUTH_MODE_KEY)
    return mode === 'register' || mode === 'forgot' ? mode : null
  } catch {
    return null
  }
}

function leaveAuthenticatedDocumentFor(mode: 'register' | 'forgot'): boolean {
  if (!getTeacherSession()) return false
  try { sessionStorage.setItem(TEACHER_AUTH_MODE_KEY, mode) } catch { /* unavailable */ }
  void logoutTeacher().finally(() => window.location.reload())
  return true
}

// --- Init ---
// The call itself is at the END of the module: the recovery branch touches
// consts (resetMode etc.) that are declared below, so init must run after
// the whole module is evaluated.

async function init() {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const callbackError = url.searchParams.get('error_description') || url.searchParams.get('error')
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const hasLegacyBearerFragment = fragment.has('access_token') || fragment.has('refresh_token')

  if (code || callbackError || hasLegacyBearerFragment) {
    // Remove callback material before any form can load Turnstile.
    history.replaceState(null, '', window.location.pathname)
  }

  if (hasLegacyBearerFragment && !getTeacherSession()) {
    showAuth('Це посилання використовує застарілий формат. Почніть вхід або відновлення паролю ще раз.')
    return
  }

  if (callbackError && !getTeacherSession()) {
    showAuth(friendlyError(callbackError))
    return
  }

  if (code) {
    try {
      const exchanged = await exchangeAuthCode('teacher', code)
      storeTeacherSession({
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        email: exchanged.email,
      })
      if (exchanged.flow === 'signup' || exchanged.flow === 'recovery') {
        try { sessionStorage.setItem(TEACHER_CALLBACK_FLOW_KEY, exchanged.flow) } catch { /* unavailable */ }
      }
      // The callback document never becomes the authenticated dashboard.
      window.location.reload()
      return
    } catch (error) {
      showAuth(friendlyError((error as Error).message))
      return
    }
  }

  const callbackFlow = readTeacherCallbackFlow()
  if (callbackFlow === 'recovery' && getTeacherSession()) {
    showAuth()
    switchToReset()
    return
  }

  const session = getTeacherSession()
  if (session?.accessToken) {
    showColdStartBanner()
    try {
      const me = await getTeacherMe()
      hideColdStartBanner()
      showDashboard(teacherLabel(me, session.email))
      clearTeacherCallbackFlow()
    } catch (err) {
      hideColdStartBanner()
      if (isUnknownAccountError(err)) {
        if (callbackFlow === 'signup') {
          // Came from the teacher signup confirmation email — intent is
          // explicit, so file the request right away.
          try {
            await registerTeacherRequest()
            clearTeacherCallbackFlow()
            showAuth(PENDING_CREATED_MSG)
          } catch {
            showAuth('Не вдалося створити кабінет. Спробуйте увійти ще раз.')
          }
        } else {
          // Google/password sign-in without a cabinet (could be a parent):
          // ask before creating anything.
          showAuth()
          showRegisterRequestBox()
        }
        return
      }
      // New account (just-confirmed email) lands here with ACCOUNT_PENDING —
      // without a message it looks like a silent failure.
      if (isPendingError(err)) {
        clearTeacherCallbackFlow()
        showAuth('✅ Акаунт створено! Він очікує підтвердження адміністратора — після підтвердження увійдіть ще раз.')
        return
      }
      // authRequest чистить сесію, якщо refresh-токен теж мертвий. Тоді показуємо
      // явне повідомлення; транзієнтна помилка (сесія лишилась) — без нього.
      showAuth(getTeacherSession() ? undefined : 'Сесія завершилася. Увійдіть знову.')
    }
  } else {
    showAuth()
    const requestedMode = takeTeacherAuthMode()
    if (requestedMode === 'register') switchToRegister()
    if (requestedMode === 'forgot') switchToForgot()
  }
}

// --- Teacher dashboard navigation ---
async function ensureOlympiadLoaded() {
  if (olympiadLoaded) return
  if (!olympiadLoading) {
    olympiadLoading = Promise.allSettled([
      loadRegistrationEvents(),
      loadClasses(),
      loadRegistrations(),
      loadCodes(),
      loadResults(),
    ]).then(results => {
      // Only latch as loaded when nothing failed; otherwise allow a retry
      // on the next visit instead of leaving the tab permanently empty.
      if (results.every(r => r.status === 'fulfilled')) olympiadLoaded = true
      else olympiadLoading = null
    })
  }
  await olympiadLoading
}

document.querySelectorAll<HTMLElement>('.teacher-section-link').forEach(link => {
  link.addEventListener('click', () => {
    const sectionName = link.dataset['section']
    if (!sectionName) return
    document.querySelectorAll('.teacher-section-link').forEach(item => {
      item.classList.remove('teacher-section-link--active')
      item.removeAttribute('aria-current')
    })
    document.querySelectorAll('.teacher-section').forEach(section => section.classList.add('hidden'))
    link.classList.add('teacher-section-link--active')
    link.setAttribute('aria-current', 'page')
    $maybe(`teacher-section-${sectionName}`)?.classList.remove('hidden')
    if (sectionName === 'olympiad') void ensureOlympiadLoaded()
  })
})

document.querySelectorAll<HTMLElement>('.teacher-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.teacher-tab').forEach(t => t.classList.remove('teacher-tab--active'))
    document.querySelectorAll('.olympiad-tab-panel').forEach(p => p.classList.add('hidden'))
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
  const loginWidgetId = turnstileWidgets.get('turnstile-container-login')
  const captchaToken = window.turnstile?.getResponse(loginWidgetId)
  if (loginWidgetId === undefined || !captchaToken) {
    loginError.textContent = 'Підтвердіть, що ви не робот (зачекайте, поки з’явиться перевірка).'
    return
  }
  loginError.textContent     = ''
  loginSubmitBtn.disabled    = true
  loginSubmitBtn.textContent = 'Вхід…'
  showColdStartBanner()
  try {
    await loginTeacher(email, password, captchaToken)
    // Leave the document that executed Turnstile before rendering private data.
    window.location.reload()
  } catch (err) {
    hideColdStartBanner()
    // Turnstile token is single-use: reset for the next attempt.
    window.turnstile?.reset(loginWidgetId)
    const msg = (err as Error).message
    if (isUnknownAccountError(err)) {
      loginError.textContent = 'Вхід виконано, але кабінету вчителя ще немає.'
      showRegisterRequestBox()
    } else {
      loginError.textContent = isPendingError(err)
        ? '⏳ Акаунт очікує підтвердження адміністратора. Зверніться до організатора олімпіади.'
        : friendlyError(msg)
    }
    loginSubmitBtn.disabled    = false
    loginSubmitBtn.textContent = 'Увійти'
  }
})

// Explicit teacher sign-up request (account exists in Supabase, no cabinet yet)
$maybe<HTMLButtonElement>('register-request-btn')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement
  btn.disabled = true
  btn.textContent = 'Надсилання…'
  try {
    await registerTeacherRequest()
    clearTeacherCallbackFlow()
    hideRegisterRequestBox()
    loginError.textContent = PENDING_CREATED_MSG
  } catch (err) {
    loginError.textContent = friendlyError((err as Error).message)
  } finally {
    btn.disabled = false
    btn.textContent = 'Подати заявку вчителя'
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

// ── Cloudflare Turnstile (explicit-рендер) ───────────────────────────────────
// Supabase captcha protection покриває і password-логін, тож api.js вантажиться
// щойно видно auth-картку (login/register/forgot — кожна форма зі своїм
// віджетом). У dashboard-потоці з живою сесією сторонній JS не виконується.
// Токен одноразовий, тож після кожної спроби робимо reset.
type TurnstileApi = {
  render: (el: string | HTMLElement, opts: { sitekey: string }) => string
  getResponse: (id?: string) => string | undefined
  reset: (id?: string) => void
}
declare global {
  interface Window { turnstile?: TurnstileApi; onloadTurnstileCallback?: () => void }
}

// One widget per container: register form and forgot-password form have their own.
const turnstileWidgets = new Map<string, string>()
let turnstileLoadPromise: Promise<void> | null = null
const TURNSTILE_SCRIPT_ID = 'turnstile-api'

function renderTurnstile(containerId: string): void {
  if (turnstileWidgets.has(containerId)) return
  const container = document.getElementById(containerId)
  if (!container || !window.turnstile) return
  turnstileWidgets.set(containerId, window.turnstile.render(container, { sitekey: TURNSTILE_SITE_KEY }))
}

function loadTurnstile(containerId: string): Promise<void> {
  if (window.turnstile) {
    renderTurnstile(containerId)
    return Promise.resolve()
  }
  if (turnstileLoadPromise) return turnstileLoadPromise.then(() => renderTurnstile(containerId))

  turnstileLoadPromise = new Promise<void>((resolve, reject) => {
    window.onloadTurnstileCallback = () => {
      renderTurnstile(containerId)
      resolve()
    }

    const script = document.createElement('script')
    script.id = TURNSTILE_SCRIPT_ID
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstileCallback'
    script.async = true
    script.defer = true
    script.addEventListener('error', () => reject(new Error('Не вдалося завантажити захист від ботів. Оновіть сторінку та спробуйте ще раз.')))
    document.head.appendChild(script)
  })

  return turnstileLoadPromise
}

function switchToRegister() {
  if (leaveAuthenticatedDocumentFor('register')) return
  // Registration always starts without a local teacher session, including
  // after a stale-token bootstrap failure.
  void logoutTeacher()
  clearTeacherCallbackFlow()
  hideRegisterRequestBox()
  loginMode?.classList.add('hidden')
  forgotMode?.classList.add('hidden')
  registerMode?.classList.remove('hidden')
  if (authCardTitle) authCardTitle.textContent = 'Реєстрація вчителя'
  if (authCardSub)   authCardSub.textContent   = 'Створіть кабінет для керування класами та результатами.'
  $maybe<HTMLInputElement>('reg-email')?.focus()
  loadTurnstile('turnstile-container').catch(err => {
    if (registerError) registerError.textContent = (err as Error).message
  })
}

function switchToLogin() {
  registerMode?.classList.add('hidden')
  forgotMode?.classList.add('hidden')
  resetMode?.classList.add('hidden')
  loginMode?.classList.remove('hidden')
  if (authCardTitle) authCardTitle.textContent = 'Вхід для вчителя'
  if (authCardSub)   authCardSub.textContent   = 'Увійдіть, щоб керувати класами, кодами та результатами.'
  $maybe<HTMLInputElement>('login-email')?.focus()
}

// ── Password recovery ────────────────────────────────────────────────────────
$maybe<HTMLButtonElement>('show-register-btn')?.addEventListener('click', switchToRegister)
$maybe<HTMLButtonElement>('hide-register-btn')?.addEventListener('click', switchToLogin)

const forgotMode      = $maybe('forgot-mode')
const forgotForm      = $maybe<HTMLFormElement>('teacher-forgot-form')
const forgotError     = $maybe('forgot-error')
const forgotSubmitBtn = $maybe<HTMLButtonElement>('forgot-submit-btn')
const resetMode       = $maybe('reset-mode')
const resetForm       = $maybe<HTMLFormElement>('teacher-reset-form')
const resetError      = $maybe('reset-error')
const resetSubmitBtn  = $maybe<HTMLButtonElement>('reset-submit-btn')
const FORGOT_TURNSTILE = 'turnstile-container-forgot'

function switchToForgot() {
  if (leaveAuthenticatedDocumentFor('forgot')) return
  hideRegisterRequestBox()
  loginMode?.classList.add('hidden')
  registerMode?.classList.add('hidden')
  forgotMode?.classList.remove('hidden')
  if (authCardTitle) authCardTitle.textContent = 'Відновлення паролю'
  if (authCardSub)   authCardSub.textContent   = 'Вкажіть email — надішлемо лист із посиланням для зміни паролю.'
  $maybe<HTMLInputElement>('forgot-email')?.focus()
  loadTurnstile(FORGOT_TURNSTILE).catch(err => {
    if (forgotError) forgotError.textContent = (err as Error).message
  })
}

function switchToReset() {
  loginMode?.classList.add('hidden')
  registerMode?.classList.add('hidden')
  forgotMode?.classList.add('hidden')
  resetMode?.classList.remove('hidden')
  if (authCardTitle) authCardTitle.textContent = 'Новий пароль'
  if (authCardSub)   authCardSub.textContent   = 'Придумайте новий пароль для входу в кабінет.'
  $maybe<HTMLInputElement>('reset-password')?.focus()
}

$maybe<HTMLButtonElement>('show-forgot-btn')?.addEventListener('click', switchToForgot)
$maybe<HTMLButtonElement>('hide-forgot-btn')?.addEventListener('click', switchToLogin)

forgotForm?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email = $maybe<HTMLInputElement>('forgot-email')?.value.trim() ?? ''
  if (!email) return
  const widgetId = turnstileWidgets.get(FORGOT_TURNSTILE)
  if (widgetId === undefined || !window.turnstile) {
    if (forgotError) {
      forgotError.textContent = 'Захист від ботів ще завантажується. Спробуйте ще раз.'
      forgotError.classList.remove('auth-message--success')
    }
    return
  }
  const captchaToken = window.turnstile.getResponse(widgetId)
  if (!captchaToken) {
    if (forgotError) {
      forgotError.textContent = 'Підтвердіть, що ви не робот.'
      forgotError.classList.remove('auth-message--success')
    }
    return
  }
  if (forgotError) {
    forgotError.textContent = ''
    forgotError.classList.remove('auth-message--success')
  }
  forgotSubmitBtn!.disabled    = true
  forgotSubmitBtn!.textContent = 'Надсилання…'
  try {
    await requestPasswordReset(email, 'teacher.html', 'teacher', captchaToken)
    if (forgotError) {
      forgotError.textContent = '✅ Якщо такий акаунт існує, лист уже в дорозі. Перевірте пошту (і папку «Спам»).'
      forgotError.classList.add('auth-message--success')
    }
  } catch (err) {
    if (forgotError) forgotError.textContent = recoveryErrorMessage((err as Error).message)
  } finally {
    window.turnstile?.reset(widgetId)
    forgotSubmitBtn!.disabled    = false
    forgotSubmitBtn!.textContent = 'Надіслати лист'
  }
})

resetForm?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const password = $maybe<HTMLInputElement>('reset-password')?.value ?? ''
  if (password.length < 8) {
    if (resetError) resetError.textContent = 'Пароль має містити щонайменше 8 символів.'
    return
  }
  const session = getTeacherSession()
  if (!session?.accessToken) {
    if (resetError) resetError.textContent = 'Посилання застаріло. Запросіть лист відновлення ще раз.'
    return
  }
  if (resetError) resetError.textContent = ''
  resetSubmitBtn!.disabled    = true
  resetSubmitBtn!.textContent = 'Збереження…'
  try {
    await updateAuthPassword(session.accessToken, password)
    clearTeacherCallbackFlow()
    window.location.reload()
  } catch (err) {
    if (resetError) resetError.textContent = friendlyError((err as Error).message)
    resetSubmitBtn!.disabled    = false
    resetSubmitBtn!.textContent = 'Зберегти пароль'
    return
  }
  resetSubmitBtn!.disabled    = false
  resetSubmitBtn!.textContent = 'Зберегти пароль'
})

// ── Google OAuth ─────────────────────────────────────────────────────────────
$maybe<HTMLButtonElement>('google-login-btn')?.addEventListener('click', async () => {
  try {
    window.location.href = await googleSignInUrl('teacher.html', 'teacher')
  } catch (error) {
    loginError.textContent = friendlyError((error as Error).message)
  }
})

registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email    = $maybe<HTMLInputElement>('reg-email')?.value.trim() ?? ''
  const school   = $maybe<HTMLInputElement>('reg-school')?.value.trim() ?? ''
  const password = $maybe<HTMLInputElement>('reg-password')?.value ?? ''
  if (!email || !password) return
  // CAPTCHA обов'язкова і на клієнті, і в Supabase Auth. Якщо скрипт ще вантажиться
  // або впав, не надсилаємо запит, який гарантовано буде відхилено.
  const turnstileWidgetId = turnstileWidgets.get('turnstile-container')
  if (turnstileWidgetId === undefined || !window.turnstile) {
    if (registerError) {
      registerError.textContent = 'Захист від ботів ще завантажується. Спробуйте ще раз.'
      registerError.classList.remove('auth-message--success')
    }
    return
  }
  const captchaToken = window.turnstile.getResponse(turnstileWidgetId)
  if (!captchaToken) {
    if (registerError) {
      registerError.textContent = 'Підтвердіть, що ви не робот.'
      registerError.classList.remove('auth-message--success')
    }
    return
  }

  if (registerError) {
    registerError.textContent = ''
    registerError.classList.remove('auth-message--success')
  }
  registerSubmitBtn!.disabled    = true
  registerSubmitBtn!.textContent = 'Реєстрація…'
  showColdStartBanner()
  try {
    await registerTeacher(email, password, school, captchaToken)
    hideColdStartBanner()
    if (registerError) {
      registerError.textContent = '✅ Реєстрацію надіслано! Перевірте пошту та підтвердіть email, потім увійдіть.'
      registerError.classList.add('auth-message--success')
    }
    // Turnstile tokens are single-use, so reset before a possible retry.
    window.turnstile.reset(turnstileWidgetId)
    registerSubmitBtn!.disabled    = false
    registerSubmitBtn!.textContent = 'Створити кабінет'
  } catch (err) {
    hideColdStartBanner()
    if (registerError) {
      registerError.textContent = friendlyError((err as Error).message)
      registerError.classList.remove('auth-message--success')
    }
    window.turnstile?.reset(turnstileWidgetId)
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
  clearTeacherCallbackFlow()
  try { sessionStorage.removeItem(TEACHER_AUTH_MODE_KEY) } catch { /* unavailable */ }
  window.location.reload()
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
    classesList.innerHTML = `<p class="empty-state__sub empty-state__sub--centered">${esc((err as Error).message)}</p>`
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
    registrationsList.innerHTML = `<p class="empty-state__sub empty-state__sub--centered">${esc((err as Error).message)}</p>`
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
      <button class="btn-class-open btn btn--secondary btn--sm" data-class-id="${esc(cls.id)}" data-class-name="${esc(cls.name)}" data-class-grade="${esc(String(cls.grade))}">
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
      <button id="class-detail-close" class="btn btn--secondary btn--sm" aria-label="Закрити">
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
      <button type="submit" class="btn btn--success btn--sm">
        <i class="fas fa-plus" aria-hidden="true"></i> Додати
      </button>
    </form>
    <p id="add-student-status" class="generate-status generate-status--spaced"></p>

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

  // Header + scrollable body
  container.innerHTML = `
    <div class="students-list__head" aria-hidden="true">
      <span>#</span>
      <span>Мітка учня</span>
      <span class="students-list__head-code">Код доступу</span>
      <span class="students-list__head-count">${students.length} учн.</span>
    </div>
    <div class="students-list__body" role="list" aria-label="Учні класу"></div>`

  const body = container.querySelector<HTMLElement>('.students-list__body')!

  students.forEach((s, i) => {
    const row = document.createElement('div')
    row.className = 'student-row'
    row.dataset['id'] = s.id
    row.setAttribute('role', 'listitem')
    // Колонка "Код" — поки порожня, буде заповнюватись після генерації кодів
    const codeVal = (s as any).code ?? ''
    row.innerHTML = `
      <span class="student-row__num">${i + 1}</span>
      <span class="student-row__label" title="${esc(s.label)}">${esc(s.label)}</span>
      <span class="student-row__code">${codeVal ? esc(codeVal) : '<span class="student-row__code-empty">—</span>'}</span>
      <div class="student-row__actions">
        <button class="btn-student-edit btn btn--secondary btn--sm" aria-label="Редагувати ${esc(s.label)}">
          <i class="fas fa-pencil-alt" aria-hidden="true"></i>
        </button>
        <button class="btn-student-delete btn btn--danger btn--sm" aria-label="Видалити ${esc(s.label)}">
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
      </div>`

    row.querySelector<HTMLButtonElement>('.btn-student-edit')!
      .addEventListener('click', () => startEditStudent(row, s, classId))

    row.querySelector<HTMLButtonElement>('.btn-student-delete')!
      .addEventListener('click', () => {
        showConfirm(
          `Видалити учня «${s.label}» зі списку?\n\nКод учня стане недійсним. Якщо він ще не проходив олімпіаду — результату не буде.`,
          async () => {
            try {
              await deleteClassStudent(s.id)
              await reloadStudentsList(classId)
            } catch (err) {
              const status = document.getElementById('add-student-status')
              if (status) { status.textContent = (err as Error).message; status.className = 'generate-status generate-status--err' }
            }
          }
        )
      })

    body.appendChild(row)
  })
}

function startEditStudent(row: HTMLElement, s: ClassStudent, classId: string) {
  // Замінюємо label на inline input
  const labelEl = row.querySelector<HTMLElement>('.student-row__label')!
  const actionsEl = row.querySelector<HTMLElement>('.student-row__actions')!
  const originalLabel = s.label

  labelEl.innerHTML = `<input class="student-edit-input form-input" value="${esc(s.label)}" maxlength="60" />`
  actionsEl.innerHTML = `
    <button class="btn-student-save btn btn--success btn--sm" aria-label="Зберегти"><i class="fas fa-check" aria-hidden="true"></i></button>
    <button class="btn-student-cancel btn btn--secondary btn--sm" aria-label="Скасувати редагування"><i class="fas fa-times" aria-hidden="true"></i></button>`

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
      <div class="teacher-info-card__main">
        <p class="teacher-info-card__title">${esc(reg.className ?? 'Клас')} · ${esc(reg.eventTitle ?? 'Подія')}</p>
        <p class="teacher-info-card__meta">${esc(String(reg.grade))} клас · ${esc(String(reg.participantsCount))} учасників · ${paymentLabel(reg.paymentStatus)} · ${codeStatus}</p>
      </div>
      <div class="teacher-info-card__actions">
        <span class="teacher-info-card__badge">${reg.status === 'cancelled' ? '❌ Скасовано' : esc(reg.status)}</span>
        ${isCancellable ? `<button class="btn-cancel-reg btn btn--danger btn--sm" data-id="${esc(reg.id)}" aria-label="Скасувати реєстрацію">
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
      row.innerHTML = `
        <span class="cancel-confirm-row__text">Скасувати? Невикористані коди буде видалено.</span>
        <button class="btn-cancel-confirm btn btn--danger btn--sm">Так, скасувати</button>
        <button class="btn-cancel-abort btn btn--secondary btn--sm">Ні</button>`
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
          msg.className = 'cancel-confirm-row__error'
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
    codesList.innerHTML = '<p class="empty-state__sub empty-state__sub--centered">Кодів немає для цієї реєстрації.</p>'
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
      const finished = r.status === 'finished'
      const award = finished ? getAward(r.score, r.totalQ) : null
      const pct   = percent(r.score, r.totalQ)
      const badgeClass = award?.kind === 'diploma' ? 'result-award result-award--diploma' : 'result-award'

      const row   = document.createElement('div')
      row.className = 'result-row'
      // ПІБ дитини не зберігається на сервері; вчитель вводить його локально перед друком.
      row.innerHTML = `
        <div>
          <p class="result-row__code">${esc(String(code))}</p>
          <p class="result-row__meta">${esc(String(grade))} клас${finished ? ` · <span class="${badgeClass}">${esc(awardLabel(r.score, r.totalQ))}</span>` : ''}</p>
        </div>
        <div class="result-row__score-wrap">
          <p class="result-row__score">${esc(String(r.score ?? '?'))}<span class="result-row__total">/${esc(String(r.totalQ ?? '?'))}</span>${finished ? ` · ${pct}%` : ''}</p>
          <p class="result-row__time">${esc(date)}</p>
        </div>
        ${finished ? `<button class="btn btn-violet btn-cert-teacher" type="button"><i class="fas fa-certificate" aria-hidden="true"></i> ${award?.kind === 'diploma' ? 'Диплом' : 'Сертифікат'}</button>` : ''}`

      if (finished) {
        row.querySelector<HTMLButtonElement>('.btn-cert-teacher')!.addEventListener('click', () =>
          openCertModal({ grade, score: r.score, totalQ: r.totalQ, finishedAt: r.finishedAt, code: String(code) }, showModal)
        )
      }
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
  teacherEmailDisplay.classList.remove('hidden')
  document.body.classList.add('teacher-dashboard-active')
  $maybe('auth-back-link')?.classList.add('hidden')
}

function showAuth(message?: string) {
  dashboardSection.classList.add('hidden')
  authSection.classList.remove('hidden')
  document.body.classList.remove('teacher-dashboard-active')
  $maybe('auth-back-link')?.classList.remove('hidden')
  loginSubmitBtn.disabled    = false
  loginSubmitBtn.textContent = 'Увійти'
  loginError.textContent = message ?? ''
  // Never introduce third-party script into a document that already holds a
  // Supabase session (recovery/pending/transient-error paths).
  if (!getTeacherSession()) {
    loadTurnstile('turnstile-container-login').catch(() => {
      loginError.textContent = 'Не вдалося завантажити захист від ботів. Оновіть сторінку.'
    })
  }
}

// ── Класна гра (просунутий School Mode) ──────────────────────────────────────
// Вчитель створює сесію, показує код класу, бачить лідерборд (анонімні
// нік+аватар, без ПІБ). Поки гра активна — лідерборд оновлюється поллінгом.

let schoolSession: SchoolSessionInfo | null = null
let schoolPollTimer: ReturnType<typeof setInterval> | null = null
let projectorTrapCleanup: (() => void) | null = null
let qrDialogTrapCleanup: (() => void) | null = null

const projectorOverlay = $maybe('school-projector')
const schoolQrDialog = $maybe('school-qr-dialog')
const projectorEls: MissionElements | null = projectorOverlay ? {
  progressText: $('school-projector-progress-text'),
  progressBar: $('school-projector-progress-bar'),
  questionText: $('school-projector-question-text'),
  image: $maybe<HTMLImageElement>('school-projector-image'),
  codeBlock: $maybe('school-projector-code'),
  options: $('school-projector-options'),
  feedback: $('school-projector-feedback'),
  explanation: $('school-projector-explanation'),
  nextBtn: $<HTMLButtonElement>('school-projector-next-btn'),
} : null

const schoolError = $maybe('school-error')

function schoolSetError(msg: string) {
  if (schoolError) schoolError.textContent = msg
}

function renderSchoolStatus() {
  if (!schoolSession) return
  const statusEl = $maybe('school-status')
  const labels: Record<string, string> = {
    lobby: 'Учні вже можуть приєднуватися. Коли всі з’являться у списку — починайте гру.',
    active: 'Гра триває. Учні, які запізнилися, також можуть приєднатися за цим кодом.',
    finished: '🏁 Завершено',
  }
  if (statusEl) statusEl.textContent = labels[schoolSession.status] ?? schoolSession.status
  // The click-a-student hint applies only once the breakdown is available
  $maybe('school-detail-hint')?.classList.toggle('hidden', schoolSession.status === 'lobby')
  $maybe('school-start-btn')?.classList.toggle('hidden', schoolSession.status !== 'lobby')
  $maybe('school-cancel-btn')?.classList.toggle('hidden', schoolSession.status !== 'lobby')
  $maybe('school-finish-btn')?.classList.toggle('hidden', schoolSession.status !== 'active')
  $maybe('school-new-btn')?.classList.toggle('hidden', schoolSession.status !== 'finished')
}

function renderSchoolLeaderboard(participants: { id: string; avatar: string; nickname: string; score: number }[]) {
  const board = $maybe('school-leaderboard')
  if (!board) return
  const count = $maybe('school-participant-count')
  if (count) count.textContent = String(participants.length)
  if (!participants.length) {
    board.innerHTML = '<p class="school-leaderboard__empty">Поки нікого. Учні відкривають посилання або вводять код на сторінці «Шкільний режим».</p>'
    return
  }
  // In lobby the breakdown endpoint is blocked (409) — no question texts
  // before start, so the rows are not clickable yet.
  const detailAvailable = schoolSession?.status !== 'lobby'
  board.innerHTML = participants.map((p, i) => `
    <button type="button" class="school-leaderboard__row${p.id === schoolDetailParticipantId ? ' school-leaderboard__row--active' : ''}"
            data-participant-id="${esc(p.id)}" aria-expanded="${p.id === schoolDetailParticipantId}"${detailAvailable ? '' : ' disabled'}>
      <span class="school-leaderboard__rank">${i + 1}</span>
      <img class="school-leaderboard__avatar" src="${esc(avatarSrc(p.avatar))}" alt="${esc(avatarLabel(p.avatar))}" width="32" height="32" />
      <span class="school-leaderboard__name">${esc(p.nickname)}</span>
      <span class="school-leaderboard__score">${p.score}</span>
    </button>`).join('')
  // onclick (not addEventListener): innerHTML is re-rendered by polling every 5s
  board.onclick = (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-participant-id]')
    const pid = row?.dataset.participantId
    if (!pid) return
    if (pid === schoolDetailParticipantId) closeParticipantDetail()
    else void openParticipantDetail(pid)
  }
}

// ── Per-participant answer breakdown ─────────────────────────────────────────
// The teacher sees what the child picked and where they erred. The server
// never returns answer keys — only the chosen-answer text and correctness.

let schoolDetailParticipantId: string | null = null

function closeParticipantDetail() {
  schoolDetailParticipantId = null
  const panel = $maybe('school-participant-detail')
  if (panel) { panel.classList.add('hidden'); panel.innerHTML = '' }
  document.querySelectorAll('.school-leaderboard__row--active').forEach(r => {
    r.classList.remove('school-leaderboard__row--active')
    r.setAttribute('aria-expanded', 'false')
  })
}

async function openParticipantDetail(participantId: string) {
  if (!schoolSession) return
  const panel = $maybe('school-participant-detail')
  if (!panel) return
  schoolDetailParticipantId = participantId
  panel.classList.remove('hidden')
  if (!panel.innerHTML) panel.innerHTML = '<p class="school-participant-detail__loading">Завантажуємо відповіді…</p>'
  document.querySelectorAll<HTMLElement>('.school-leaderboard__row').forEach(r => {
    const active = r.dataset.participantId === participantId
    r.classList.toggle('school-leaderboard__row--active', active)
    r.setAttribute('aria-expanded', String(active))
  })
  try {
    const { participant, answers } = await getSchoolParticipantAnswers(schoolSession.id, participantId)
    // The teacher may have switched to another participant mid-request
    if (schoolDetailParticipantId !== participantId) return
    panel.innerHTML = `
      <div class="school-participant-detail__head">
        <img class="school-leaderboard__avatar" src="${esc(avatarSrc(participant.avatar))}" alt="" width="32" height="32" />
        <strong class="school-participant-detail__name">${esc(participant.nickname)}</strong>
        <span class="school-participant-detail__score">${answers.filter(a => a.isCorrect).length} з ${answers.length}</span>
        <button type="button" id="school-detail-close" class="school-participant-detail__close" aria-label="Закрити розбір відповідей">✕</button>
      </div>
      ${answers.map(a => renderAnswerRow(a)).join('')}`
    $maybe('school-detail-close')?.addEventListener('click', closeParticipantDetail)
  } catch {
    if (schoolDetailParticipantId !== participantId) return
    panel.innerHTML = '<p class="school-participant-detail__loading">Не вдалося завантажити відповіді. Спробуйте ще раз.</p>'
  }
}

function renderAnswerRow(a: SchoolParticipantAnswer): string {
  const state = !a.answered ? 'empty' : a.isCorrect ? 'correct' : 'incorrect'
  const icon  = !a.answered ? '·' : a.isCorrect ? '✓' : '✗'
  const answerLine = !a.answered
    ? 'Без відповіді'
    : `Відповідь: ${esc(a.answerText ?? '')}`
  return `
    <div class="school-answer-row school-answer-row--${state}">
      <span class="school-answer-row__icon" aria-hidden="true">${icon}</span>
      <div class="school-answer-row__body">
        <p class="school-answer-row__q">${a.position + 1}. ${esc(a.q)}</p>
        <p class="school-answer-row__a">${answerLine}</p>
      </div>
    </div>`
}

// Зведення за темами: слабші зверху, колірний індикатор засвоєння.
function renderSchoolTopicStats(topicStats: SchoolTopicStat[]) {
  const wrap = $maybe('school-topic-stats-wrap')
  const box  = $maybe('school-topic-stats')
  if (!wrap || !box) return
  const rows = topicStats.filter(s => s.total > 0)
  if (!rows.length) { wrap.classList.add('hidden'); box.innerHTML = ''; return }

  rows.sort((a, b) => (a.correct / a.total) - (b.correct / b.total))
  box.innerHTML = rows.map(s => {
    const pct = Math.round((s.correct / s.total) * 100)
    const level = pct < 50 ? 'low' : pct < 75 ? 'medium' : 'high'
    const label = s.topic ? (TOPIC_LABELS[s.topic] ?? s.topic) : 'Без теми'
    return `
      <div class="school-topic-stat">
        <span class="school-topic-stat__label">${esc(label)}</span>
        <progress class="school-topic-stat__bar school-topic-stat__bar--${level}" value="${pct}" max="100" aria-label="${esc(label)}: ${pct}%"></progress>
        <span class="school-topic-stat__score">${pct}% · ${s.correct}/${s.total}</span>
      </div>`
  }).join('')
  wrap.classList.remove('hidden')
}

async function refreshSchoolSession() {
  if (!schoolSession) return
  const sessionId = schoolSession.id
  try {
    const { session, participants, topicStats } = await getSchoolSession(sessionId)
    if (!schoolSession || schoolSession.id !== sessionId) return
    schoolSession = session
    renderSchoolStatus()
    renderSchoolLeaderboard(participants)
    renderSchoolTopicStats(topicStats)
    // Refresh an open breakdown together with the leaderboard while live
    if (schoolDetailParticipantId && session.status !== 'finished') {
      void openParticipantDetail(schoolDetailParticipantId)
    }
    if (session.status === 'finished' && schoolPollTimer) {
      clearInterval(schoolPollTimer)
      schoolPollTimer = null
    }
  } catch {
    // тихий поллінг: транзієнтну помилку ігноруємо, наступний тік повторить
  }
}

function startSchoolPolling() {
  if (schoolPollTimer) clearInterval(schoolPollTimer)
  void refreshSchoolSession()
  schoolPollTimer = setInterval(refreshSchoolSession, 5000)
}

function populateSchoolTopics() {
  const topicSel = $maybe<HTMLSelectElement>('school-topic')
  if (!topicSel) return
  const topics = TOPICS_BY_TRACK['informatics']
  topicSel.innerHTML = '<option value="">Будь-яка тема</option>' +
    topics.map(t => `<option value="${t}">${TOPIC_LABELS[t] ?? t}</option>`).join('')
}

populateSchoolTopics()

// This is the content-source boundary for a classroom session. A future
// "My questions" source can extend this payload without rebuilding the form.
function classroomSessionPayload() {
  const difficulty = $<HTMLSelectElement>('school-difficulty').value
  const topic = $<HTMLSelectElement>('school-topic').value
  return {
    grade: Number($<HTMLSelectElement>('school-grade').value),
    track: 'informatics',
    ...(difficulty ? { difficulty } : {}),
    ...(topic ? { topic } : {}),
    questionsCount: Number($<HTMLSelectElement>('school-count').value),
  }
}

function setSchoolCreateBusy(busy: boolean) {
  const codeBtn = $maybe<HTMLButtonElement>('school-create-btn')
  const projectorBtn = $maybe<HTMLButtonElement>('school-projector-btn')
  if (codeBtn) codeBtn.disabled = busy
  if (projectorBtn) projectorBtn.disabled = busy
}

function resetSchoolView() {
  closeSchoolQrDialog()
  closeParticipantDetail()
  schoolSession = null
  if (schoolPollTimer) { clearInterval(schoolPollTimer); schoolPollTimer = null }
  $maybe('school-live')?.classList.add('hidden')
  $maybe('school-create-panel')?.classList.remove('hidden')
  schoolSetError('')
}

function buildSchoolJoinUrl(code: string): string {
  const url = new URL('school.html', window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('code', code)
  return url.toString()
}

async function renderSchoolJoinQr(joinUrl: string, joinCode: string) {
  const canvas = $maybe<HTMLCanvasElement>('school-join-qr')
  const largeCanvas = $maybe<HTMLCanvasElement>('school-join-qr-large')
  const card = $maybe('school-join-qr-card')
  const caption = $maybe('school-join-qr-caption')
  const fallback = $maybe('school-join-qr-fallback')
  const openBtn = $maybe<HTMLButtonElement>('school-join-qr-open')
  const dialogCode = $maybe('school-qr-dialog-code')
  if (!canvas || !largeCanvas || !card || !caption || !fallback || !openBtn || !dialogCode) return

  card.setAttribute('aria-busy', 'true')
  openBtn.disabled = true
  canvas.classList.add('hidden')
  canvas.removeAttribute('data-ready')
  largeCanvas.removeAttribute('data-ready')
  caption.classList.remove('hidden')
  fallback.classList.add('hidden')
  try {
    const { default: QRCode } = await import('qrcode')
    const sharedOptions = {
      errorCorrectionLevel: 'Q' as const,
      margin: 3,
      color: { dark: '#071226', light: '#ffffff' },
    }
    await Promise.all([
      QRCode.toCanvas(canvas, joinUrl, { ...sharedOptions, width: 240 }),
      QRCode.toCanvas(largeCanvas, joinUrl, { ...sharedOptions, width: 1200 }),
    ])
    // The renderer adds fixed inline dimensions; CSS owns the responsive size.
    for (const qrCanvas of [canvas, largeCanvas]) {
      qrCanvas.removeAttribute('style')
    }
    openBtn.setAttribute('aria-label', `Збільшити QR-код для гри ${joinCode}`)
    largeCanvas.setAttribute('aria-label', `QR-код для приєднання до гри ${joinCode}`)
    dialogCode.textContent = joinCode
    canvas.dataset.ready = 'true'
    largeCanvas.dataset.ready = 'true'
    canvas.classList.remove('hidden')
    openBtn.disabled = false
  } catch {
    canvas.classList.add('hidden')
    caption.classList.add('hidden')
    fallback.classList.remove('hidden')
  } finally {
    card.setAttribute('aria-busy', 'false')
  }
}

function openSchoolQrDialog() {
  const openBtn = $maybe<HTMLButtonElement>('school-join-qr-open')
  if (!schoolQrDialog || !openBtn || openBtn.disabled) return
  schoolQrDialog.classList.remove('hidden')
  document.body.classList.add('teacher-qr-dialog-active')
  qrDialogTrapCleanup?.()
  qrDialogTrapCleanup = createFocusTrap(schoolQrDialog, closeSchoolQrDialog)
}

function closeSchoolQrDialog() {
  if (!schoolQrDialog || schoolQrDialog.classList.contains('hidden')) return
  schoolQrDialog.classList.add('hidden')
  document.body.classList.remove('teacher-qr-dialog-active')
  qrDialogTrapCleanup?.()
  qrDialogTrapCleanup = null
}

$maybe<HTMLButtonElement>('school-join-qr-open')?.addEventListener('click', openSchoolQrDialog)
$maybe<HTMLButtonElement>('school-qr-dialog-close')?.addEventListener('click', closeSchoolQrDialog)
schoolQrDialog?.addEventListener('click', event => {
  if (event.target === schoolQrDialog) closeSchoolQrDialog()
})

function showSchoolLobby(session: SchoolSessionInfo) {
  schoolSession = session
  $('school-join-code').textContent = session.joinCode
  const link = $maybe<HTMLInputElement>('school-join-link')
  const joinUrl = buildSchoolJoinUrl(session.joinCode)
  if (link) link.value = joinUrl
  void renderSchoolJoinQr(joinUrl, session.joinCode)
  $maybe('school-create-panel')?.classList.add('hidden')
  $maybe('school-live')?.classList.remove('hidden')
  renderSchoolStatus()
  renderSchoolLeaderboard([])
  startSchoolPolling()
}

$maybe<HTMLButtonElement>('school-create-btn')?.addEventListener('click', async () => {
  schoolSetError('')
  setSchoolCreateBusy(true)
  try {
    const { session } = await createSchoolSession(classroomSessionPayload())
    showSchoolLobby(session)
  } catch (err) {
    const apiErr = err as Error & { status?: number }
    schoolSetError(apiErr.status === 422
      ? `${apiErr.message}. Спробуйте іншу тему, складність або клас.`
      : friendlyError(apiErr.message))
  } finally {
    setSchoolCreateBusy(false)
  }
})

$maybe<HTMLButtonElement>('school-copy-link-btn')?.addEventListener('click', async () => {
  const input = $maybe<HTMLInputElement>('school-join-link')
  const button = $maybe<HTMLButtonElement>('school-copy-link-btn')
  if (!input || !button) return
  try {
    await navigator.clipboard.writeText(input.value)
  } catch {
    input.select()
    document.execCommand('copy')
  }
  button.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Скопійовано'
  window.setTimeout(() => {
    button.innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i> Копіювати'
  }, 1800)
})

async function cancelSchoolLobby(sessionId: string) {
  const cancelBtn = $maybe<HTMLButtonElement>('school-cancel-btn')
  const startBtn = $maybe<HTMLButtonElement>('school-start-btn')
  if (cancelBtn) cancelBtn.disabled = true
  if (startBtn) startBtn.disabled = true
  schoolSetError('')
  try {
    await finishSchoolSession(sessionId)
    if (schoolSession?.id !== sessionId) return
    resetSchoolView()
    $maybe<HTMLSelectElement>('school-topic')?.focus()
  } catch (err) {
    schoolSetError(friendlyError((err as Error).message))
  } finally {
    if (cancelBtn) cancelBtn.disabled = false
    if (startBtn) startBtn.disabled = false
  }
}

$maybe<HTMLButtonElement>('school-cancel-btn')?.addEventListener('click', () => {
  if (!schoolSession || schoolSession.status !== 'lobby') return
  const sessionId = schoolSession.id
  showConfirm(
    'Скасувати цю гру? Учні більше не зможуть приєднатися за поточним кодом.',
    () => { void cancelSchoolLobby(sessionId) },
  )
})

function openProjector(questions: Question[]) {
  if (!schoolSession || !projectorOverlay || !projectorEls) return
  $maybe('school-create-panel')?.classList.add('hidden')
  $maybe('school-projector-stage')?.classList.remove('hidden')
  $maybe('school-projector-complete')?.classList.add('hidden')
  projectorOverlay.classList.remove('hidden')
  document.body.classList.add('teacher-projector-active')
  projectorTrapCleanup?.()
  projectorTrapCleanup = createFocusTrap(projectorOverlay, () => { void closeProjector() })

  runMission(projectorEls, questions, {
    showExplanation: false,
    incorrectFeedback: 'Майже! Обговоріть відповідь разом.',
    completeLabel: 'Завершити гру',
    submitAnswer: async (questionId, answer) => {
      if (!schoolSession) throw new Error('Сесію завершено')
      const result = await submitSchoolProjectorAnswer(schoolSession.id, questionId, answer)
      return result.correct
    },
    onComplete: async summary => {
      $maybe('school-projector-stage')?.classList.add('hidden')
      $maybe('school-projector-complete')?.classList.remove('hidden')
      const result = $maybe('school-projector-result')
      if (result) result.textContent = `Правильних відповідей: ${summary.correct} із ${summary.total}.`
      if (schoolSession?.status === 'active') {
        try {
          await finishSchoolSession(schoolSession.id)
          schoolSession.status = 'finished'
        } catch { /* the completion screen remains usable after a transient error */ }
      }
    },
  })
}

async function closeProjector() {
  if (schoolSession?.status === 'active') {
    try { await finishSchoolSession(schoolSession.id) } catch { /* best-effort close */ }
  }
  if (document.fullscreenElement === projectorOverlay) {
    try { await document.exitFullscreen() } catch { /* already leaving fullscreen */ }
  }
  projectorOverlay?.classList.add('hidden')
  document.body.classList.remove('teacher-projector-active', 'mission-answered')
  projectorTrapCleanup?.()
  projectorTrapCleanup = null
  resetSchoolView()
}

$maybe<HTMLButtonElement>('school-projector-btn')?.addEventListener('click', async () => {
  schoolSetError('')
  setSchoolCreateBusy(true)
  try {
    const { session } = await createSchoolSession(classroomSessionPayload())
    schoolSession = session
    await startSchoolSession(session.id)
    schoolSession.status = 'active'
    const { questions } = await getSchoolSessionQuestions(session.id)
    openProjector(questions)
  } catch (err) {
    const apiErr = err as Error & { status?: number }
    const message = apiErr.status === 422
      ? `${apiErr.message}. Спробуйте іншу тему, складність або клас.`
      : friendlyError(apiErr.message)
    // If the session was already started but questions failed to load, close it
    // on the server so we do not leak a lingering active session with no UI.
    if (schoolSession?.status === 'active') {
      try { await finishSchoolSession(schoolSession.id) } catch { /* best-effort cleanup */ }
    }
    resetSchoolView()
    schoolSetError(message)
  } finally {
    setSchoolCreateBusy(false)
  }
})

$maybe<HTMLButtonElement>('school-projector-fullscreen-btn')?.addEventListener('click', () => {
  if (projectorOverlay?.requestFullscreen) void projectorOverlay.requestFullscreen()
})
$maybe<HTMLButtonElement>('school-projector-close-btn')?.addEventListener('click', () => { void closeProjector() })
$maybe<HTMLButtonElement>('school-projector-new-btn')?.addEventListener('click', () => { void closeProjector() })

$maybe<HTMLButtonElement>('school-start-btn')?.addEventListener('click', async () => {
  if (!schoolSession) return
  schoolSetError('')
  try {
    await startSchoolSession(schoolSession.id)
    schoolSession.status = 'active'
    renderSchoolStatus()
  } catch (err) {
    schoolSetError(friendlyError((err as Error).message))
  }
})

$maybe<HTMLButtonElement>('school-finish-btn')?.addEventListener('click', async () => {
  if (!schoolSession) return
  schoolSetError('')
  try {
    await finishSchoolSession(schoolSession.id)
    schoolSession.status = 'finished'
    renderSchoolStatus()
    await refreshSchoolSession()
  } catch (err) {
    schoolSetError(friendlyError((err as Error).message))
  }
})

$maybe<HTMLButtonElement>('school-new-btn')?.addEventListener('click', () => {
  resetSchoolView()
})

// Runs last so every const above is initialized (see the Init comment).
void init()
