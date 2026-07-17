import './frontend-security.js'
import './register-sw.js'
import {
  loginTeacher, logoutTeacher, getTeacherSession, storeTeacherSession, registerTeacher,
  createTeacherClass, createTeacherRegistration,
  getTeacherMe, generateCodes, getTeacherClasses, getTeacherCodes,
  getTeacherRegistrationEvents, getTeacherRegistrations, getTeacherResults,
  cancelTeacherRegistration,
  requestPasswordReset, updateAuthPassword, googleSignInUrl, registerTeacherRequest,
  getClassStudents, addClassStudent, updateClassStudent, deleteClassStudent,
  createSchoolSession, startSchoolSession, finishSchoolSession, getSchoolSession,
  TURNSTILE_SITE_KEY,
  type TeacherClass, type ClassStudent, type EventRegistration, type TeacherEvent, type Attempt,
  type SchoolSessionInfo,
} from './features/api/client.js'
import { esc, friendlyError, recoveryErrorMessage, showConfirm, showModal } from './utils/ui.js'
import { openCertModal, awardLabel, percent, getAward } from './utils/certificate.js'
import { TOPICS_BY_TRACK, TOPIC_LABELS } from './features/missions/topics.js'
import type { SchoolTopicStat } from './features/api/client.js'

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

// Set right before the redirect to Google; checked (and cleared) by init()
// when tokens come back in the hash without a `type`.
const OAUTH_PENDING_KEY = 'rozumko_teacher_oauth_pending'

// --- Init ---
// The call itself is at the END of the module: the recovery branch touches
// consts (resetMode etc.) that are declared below, so init must run after
// the whole module is evaluated.

async function init() {
  // Обробляємо #access_token=... після підтвердження email від Supabase
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const accessToken  = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  // 'signup' | 'magiclink' | 'recovery'; OAuth (Google) returns tokens WITHOUT type
  const type         = hash.get('type')

  if (accessToken) {
    // Anti-fixation: a typeless token is only trusted when THIS tab started the
    // OAuth redirect (flag set by the Google button). A crafted link like
    // teacher.html#access_token=<attacker> must not silently sign the user in.
    const trustedType = type === 'signup' || type === 'magiclink' || type === 'recovery'
    let oauthPending = false
    try {
      oauthPending = sessionStorage.getItem(OAUTH_PENDING_KEY) === '1'
      sessionStorage.removeItem(OAUTH_PENDING_KEY)
    } catch { /* sessionStorage unavailable */ }

    if (trustedType || oauthPending) {
      // Зберігаємо сесію з токена в хеші
      storeTeacherSession({
        accessToken,
        refreshToken: refreshToken ?? '',
        email: '',
      })
    }
    // Очищаємо хеш з URL щоб токен не залишався в адресному рядку
    history.replaceState(null, '', window.location.pathname)
  }

  if (accessToken && type === 'recovery') {
    // Password-recovery link: ask for a new password before anything else.
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
      await Promise.all([loadRegistrationEvents(), loadClasses(), loadRegistrations(), loadCodes(), loadResults()])
    } catch (err) {
      hideColdStartBanner()
      if (isUnknownAccountError(err)) {
        if (type === 'signup') {
          // Came from the teacher signup confirmation email — intent is
          // explicit, so file the request right away.
          try {
            await registerTeacherRequest()
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
        showAuth('✅ Акаунт створено! Він очікує підтвердження адміністратора — після підтвердження увійдіть ще раз.')
        return
      }
      // authRequest чистить сесію, якщо refresh-токен теж мертвий. Тоді показуємо
      // явне повідомлення; транзієнтна помилка (сесія лишилась) — без нього.
      showAuth(getTeacherSession() ? undefined : 'Сесія завершилася. Увійдіть знову.')
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
    showDashboard(teacherLabel(me, email))
    await Promise.all([loadRegistrationEvents(), loadClasses(), loadRegistrations(), loadCodes(), loadResults()])
  } catch (err) {
    hideColdStartBanner()
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
// api.js вантажимо лише після відкриття форми реєстрації. Так зовнішній JS
// Cloudflare не виконується у звичайному login/dashboard-потоці.
// Токен одноразовий, тож після кожної спроби реєстрації робимо reset.
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
  // Реєстрація завжди починається без локальної teacher-сесії. Це також закриває
  // крайовий випадок зі stale token після невдалого bootstrap-запиту до API.
  void logoutTeacher()
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
  // Після виконання стороннього JS повертаємось до чистого документа перед входом.
  if (document.getElementById(TURNSTILE_SCRIPT_ID) || window.turnstile) {
    window.location.reload()
    return
  }
  registerMode?.classList.add('hidden')
  forgotMode?.classList.add('hidden')
  resetMode?.classList.add('hidden')
  loginMode?.classList.remove('hidden')
  if (authCardTitle) authCardTitle.textContent = 'Вхід для вчителя'
  if (authCardSub)   authCardSub.textContent   = 'Увійдіть, щоб керувати класами, кодами та результатами.'
  $maybe<HTMLInputElement>('login-email')?.focus()
}

// ── Password recovery ────────────────────────────────────────────────────────
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
      forgotError.classList.remove('form-error--success')
    }
    return
  }
  const captchaToken = window.turnstile.getResponse(widgetId)
  if (!captchaToken) {
    if (forgotError) {
      forgotError.textContent = 'Підтвердіть, що ви не робот.'
      forgotError.classList.remove('form-error--success')
    }
    return
  }
  if (forgotError) {
    forgotError.textContent = ''
    forgotError.classList.remove('form-error--success')
  }
  forgotSubmitBtn!.disabled    = true
  forgotSubmitBtn!.textContent = 'Надсилання…'
  try {
    await requestPasswordReset(email, 'teacher.html', captchaToken)
    if (forgotError) {
      forgotError.textContent = '✅ Якщо такий акаунт існує, лист уже в дорозі. Перевірте пошту (і папку «Спам»).'
      forgotError.classList.add('form-error--success')
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
  } catch (err) {
    if (resetError) resetError.textContent = friendlyError((err as Error).message)
    resetSubmitBtn!.disabled    = false
    resetSubmitBtn!.textContent = 'Зберегти пароль'
    return
  }
  // Password is saved; try to enter the dashboard with the same session.
  showColdStartBanner()
  try {
    const me = await getTeacherMe()
    hideColdStartBanner()
    showDashboard(teacherLabel(me, session.email))
    await Promise.all([loadRegistrationEvents(), loadClasses(), loadRegistrations(), loadCodes(), loadResults()])
  } catch (err) {
    hideColdStartBanner()
    switchToLogin()
    loginError.textContent = isPendingError(err)
      ? '✅ Пароль змінено, але акаунт ще очікує підтвердження адміністратора.'
      : '✅ Пароль змінено. Увійдіть з новим паролем.'
  }
  resetSubmitBtn!.disabled    = false
  resetSubmitBtn!.textContent = 'Зберегти пароль'
})

// ── Google OAuth ─────────────────────────────────────────────────────────────
$maybe<HTMLButtonElement>('google-login-btn')?.addEventListener('click', () => {
  // The flag is what lets init() trust the typeless token on return.
  try { sessionStorage.setItem(OAUTH_PENDING_KEY, '1') } catch { /* sessionStorage unavailable */ }
  window.location.href = googleSignInUrl('teacher.html')
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
      registerError.classList.remove('form-error--success')
    }
    return
  }
  const captchaToken = window.turnstile.getResponse(turnstileWidgetId)
  if (!captchaToken) {
    if (registerError) {
      registerError.textContent = 'Підтвердіть, що ви не робот.'
      registerError.classList.remove('form-error--success')
    }
    return
  }

  if (registerError) {
    registerError.textContent = ''
    registerError.classList.remove('form-error--success')
  }
  registerSubmitBtn!.disabled    = true
  registerSubmitBtn!.textContent = 'Реєстрація…'
  showColdStartBanner()
  try {
    await registerTeacher(email, password, school, captchaToken)
    hideColdStartBanner()
    if (registerError) {
      registerError.textContent = '✅ Реєстрацію надіслано! Перевірте пошту та підтвердіть email, потім увійдіть.'
      registerError.classList.add('form-error--success')
    }
    // Токен Turnstile одноразовий — скидаємо перед можливою повторною спробою.
    window.turnstile.reset(turnstileWidgetId)
    registerSubmitBtn!.disabled    = false
    registerSubmitBtn!.textContent = 'Створити кабінет'
  } catch (err) {
    hideColdStartBanner()
    if (registerError) {
      registerError.textContent = friendlyError((err as Error).message)
      registerError.classList.remove('form-error--success')
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
}

// ── Класна гра (просунутий School Mode) ──────────────────────────────────────
// Вчитель створює сесію, показує код класу, бачить лідерборд (анонімні
// нік+аватар, без ПІБ). Поки гра активна — лідерборд оновлюється поллінгом.

let schoolSession: SchoolSessionInfo | null = null
let schoolPollTimer: ReturnType<typeof setInterval> | null = null

const schoolError = $maybe('school-error')

function schoolSetError(msg: string) {
  if (schoolError) schoolError.textContent = msg
}

function renderSchoolStatus() {
  if (!schoolSession) return
  const statusEl = $maybe('school-status')
  // Учні можуть приєднатися лише ПІСЛЯ старту (join у lobby сервер відхиляє).
  const labels: Record<string, string> = {
    lobby: '⏳ Натисніть «Почати гру» — тоді учні зможуть ввести код',
    active: '🟢 Гра триває — диктуйте код учням',
    finished: '🏁 Завершено',
  }
  if (statusEl) statusEl.textContent = labels[schoolSession.status] ?? schoolSession.status
  $maybe('school-start-btn')?.classList.toggle('hidden', schoolSession.status !== 'lobby')
  $maybe('school-finish-btn')?.classList.toggle('hidden', schoolSession.status !== 'active')
  $maybe('school-new-btn')?.classList.toggle('hidden', schoolSession.status !== 'finished')
}

function renderSchoolLeaderboard(participants: { avatar: string; nickname: string; score: number }[]) {
  const board = $maybe('school-leaderboard')
  if (!board) return
  if (!participants.length) {
    board.innerHTML = '<p class="school-leaderboard__empty">Поки нікого. Учні вводять код на сторінці «Шкільний режим».</p>'
    return
  }
  board.innerHTML = participants.map((p, i) => `
    <div class="school-leaderboard__row">
      <span class="school-leaderboard__rank">${i + 1}</span>
      <img class="school-leaderboard__avatar" src="${esc(avatarSrc(p.avatar))}" alt="${esc(avatarLabel(p.avatar))}" width="32" height="32" />
      <span class="school-leaderboard__name">${esc(p.nickname)}</span>
      <span class="school-leaderboard__score">${p.score}</span>
    </div>`).join('')
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
  try {
    const { session, participants, topicStats } = await getSchoolSession(schoolSession.id)
    schoolSession = session
    renderSchoolStatus()
    renderSchoolLeaderboard(participants)
    renderSchoolTopicStats(topicStats)
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

// Тема залежить від напряму (той самий словник, що й публічні сторінки).
$maybe<HTMLSelectElement>('school-track')?.addEventListener('change', (e) => {
  const track = (e.target as HTMLSelectElement).value
  const topicSel = $maybe<HTMLSelectElement>('school-topic')
  if (!topicSel) return
  const topics = (TOPICS_BY_TRACK as Record<string, readonly string[]>)[track] ?? []
  topicSel.innerHTML = '<option value="">Будь-яка</option>' +
    topics.map(t => `<option value="${t}">${TOPIC_LABELS[t] ?? t}</option>`).join('')
  topicSel.disabled = topics.length === 0
})

$maybe<HTMLButtonElement>('school-create-btn')?.addEventListener('click', async () => {
  schoolSetError('')
  const grade = Number($<HTMLSelectElement>('school-grade').value)
  const difficulty = $<HTMLSelectElement>('school-difficulty').value
  const track = $<HTMLSelectElement>('school-track').value
  const topic = $<HTMLSelectElement>('school-topic').value
  const questionsCount = Number($<HTMLSelectElement>('school-count').value)
  try {
    const { session } = await createSchoolSession({
      grade,
      ...(difficulty ? { difficulty } : {}),
      ...(track ? { track } : {}),
      ...(topic ? { topic } : {}),
      questionsCount,
    })
    schoolSession = session
    $('school-join-code').textContent = session.joinCode
    $maybe('school-live')?.classList.remove('hidden')
    renderSchoolStatus()
    renderSchoolLeaderboard([])
    startSchoolPolling()
  } catch (err) {
    const apiErr = err as Error & { status?: number }
    schoolSetError(apiErr.status === 422
      ? `${apiErr.message}. Спробуйте іншу тему, складність або клас.`
      : friendlyError(apiErr.message))
  }
})

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
  schoolSession = null
  if (schoolPollTimer) { clearInterval(schoolPollTimer); schoolPollTimer = null }
  $maybe('school-live')?.classList.add('hidden')
  schoolSetError('')
})

// Runs last so every const above is initialized (see the Init comment).
void init()
