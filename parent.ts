import './frontend-security.js'
import './register-sw.js'
import {
  TURNSTILE_SITE_KEY,
  createParentProfile,
  getParentEntitlement,
  getParentReports,
  getParentSession,
  listParentProfiles,
  loginParent,
  logoutParent,
  registerParentAccount,
  registerParentAuth,
  setActiveParentProfile,
  storeParentSession,
  submitParentPathProgress,
  updateParentProfile,
  type ParentProfile,
  type ParentMissionReport,
} from './features/api/client.js'
import { PATHS_BY_GRADE, type GradePathMap, type PathPoint } from './features/path/path-data.js'
import { createProgressStore, type ProgressStore, type QueuedResult } from './features/path/progress-store.js'
import { $ } from './utils/dom.js'

type TurnstileApi = {
  render: (element: string | HTMLElement, options: { sitekey: string }) => string
  getResponse: (widgetId?: string) => string | undefined
  reset: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    onloadParentTurnstile?: () => void
  }
}

const authSection = $('parent-auth')
const dashboard = $('parent-dashboard')
const loginMode = $('parent-login-mode')
const registerMode = $('parent-register-mode')
const loginForm = $<HTMLFormElement>('parent-login-form')
const registerForm = $<HTMLFormElement>('parent-register-form')
const profileForm = $<HTMLFormElement>('parent-profile-form')
const loginError = $('parent-login-error')
const registerError = $('parent-register-error')
const profileError = $('parent-profile-error')
const dashboardStatus = $('parent-dashboard-status')
const profilesRoot = $('parent-profiles')
const entitlementRoot = $('parent-entitlement')
const reportsRoot = $('parent-reports')
const importRoot = $('parent-path-import')
const importMessage = $('parent-path-import-message')

interface PendingPathImport {
  map: GradePathMap
  point: PathPoint
  store: ProgressStore
  entries: QueuedResult[]
}

function findPendingPathImports(): PendingPathImport[] {
  const store = createProgressStore(window.localStorage, 'local')
  const queue = store.pendingQueue()
  const recentFirst = [...queue].reverse()
  const maps = Object.values(PATHS_BY_GRADE)
  const result: PendingPathImport[] = []
  for (const map of maps) {
    const point = map.points[0]
    if (!point || !store.isCompleted(point.id)) continue
    const entries = point.activities.filter(step => step.required).map(step => {
      const activityId = `path:${point.id}:${step.id}`
      return recentFirst.find(entry => entry.pointId === point.id
        && entry.result.activityId === activityId
        && entry.result.activityVersion === step.version)
    })
    if (entries.every((entry): entry is QueuedResult => Boolean(entry))) {
      result.push({ map, point, store, entries })
    }
  }
  return result
}

let pendingImports = findPendingPathImports()

let turnstileWidgetId: string | null = null
let turnstileLoad: Promise<void> | null = null

function friendly(error: unknown): string {
  const message = (error as Error)?.message ?? 'Сталася помилка'
  if (/Invalid login credentials/i.test(message)) return 'Невірний email або пароль.'
  if (/Email not confirmed/i.test(message)) return 'Підтвердьте email за посиланням у листі.'
  if (/Failed to fetch|з'єднання|network/i.test(message)) return 'Немає зʼєднання із сервером. Спробуйте ще раз.'
  return message
}

function showLogin() {
  registerMode.classList.add('hidden')
  loginMode.classList.remove('hidden')
  $('parent-auth-title').textContent = 'Кабінет батьків'
  $('parent-auth-subtitle').textContent = 'Увійдіть, щоб дитина продовжила свій шлях на цьому пристрої.'
  $<HTMLInputElement>('parent-login-email').focus()
}

function renderTurnstile() {
  if (turnstileWidgetId !== null || !window.turnstile) return
  turnstileWidgetId = window.turnstile.render('parent-turnstile', { sitekey: TURNSTILE_SITE_KEY })
}

function loadTurnstile(): Promise<void> {
  if (window.turnstile) {
    renderTurnstile()
    return Promise.resolve()
  }
  if (turnstileLoad) return turnstileLoad
  turnstileLoad = new Promise((resolve, reject) => {
    window.onloadParentTurnstile = () => {
      renderTurnstile()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadParentTurnstile'
    script.async = true
    script.defer = true
    script.addEventListener('error', () => reject(new Error('Не вдалося завантажити захист від ботів.')))
    document.head.appendChild(script)
  })
  return turnstileLoad
}

function showRegister() {
  loginMode.classList.add('hidden')
  registerMode.classList.remove('hidden')
  $('parent-auth-title').textContent = 'Реєстрація для батьків'
  $('parent-auth-subtitle').textContent = 'Створіть свій акаунт. Дитячий профіль додасте після підтвердження email.'
  $<HTMLInputElement>('parent-register-email').focus()
  void loadTurnstile().catch(error => { registerError.textContent = friendly(error) })
}

function showAuth(message = '') {
  dashboard.classList.add('hidden')
  authSection.classList.remove('hidden')
  loginError.textContent = message
}

function profileCard(profile: ParentProfile, activeId: string | null): HTMLElement {
  const article = document.createElement('article')
  article.className = `parent-profile-card${profile.id === activeId ? ' parent-profile-card--active' : ''}`

  const avatar = document.createElement('span')
  avatar.className = 'parent-profile-card__avatar'
  avatar.setAttribute('aria-hidden', 'true')
  avatar.textContent = profile.grade === 1 ? '🌱' : profile.grade === 2 ? '🚀' : profile.grade === 3 ? '🧠' : '🏆'

  const name = document.createElement('span')
  name.className = 'parent-profile-card__name'
  name.textContent = profile.displayName || 'Дитячий профіль'

  const grade = document.createElement('span')
  grade.className = 'parent-profile-card__grade'
  grade.textContent = `${profile.grade} клас`

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'kid-action'
  const profilePath = PATHS_BY_GRADE[profile.grade]
  if (profilePath) {
    button.textContent = profile.id === activeId ? 'Продовжити шлях →' : 'Обрати й грати →'
    button.addEventListener('click', () => {
      setActiveParentProfile(profile.id)
      window.location.href = `path.html?grade=${profilePath.grade}`
    })
  } else {
    button.textContent = 'Шлях готується'
    button.disabled = true
    button.setAttribute('aria-label', `Шлях для ${profile.grade} класу ще готується`)
  }
  article.append(avatar, name, grade, button)

  const matchingImport = pendingImports.find(pi => pi.map.grade === profile.grade)
  if (matchingImport) {
    const importButton = document.createElement('button')
    importButton.type = 'button'
    importButton.className = 'kid-action parent-profile-card__import'
    importButton.textContent = 'Зберегти першу місію тут'
    importButton.addEventListener('click', async () => {
      importButton.disabled = true
      dashboardStatus.textContent = 'Зберігаємо першу місію…'
      try {
        await submitParentPathProgress(profile.id, {
          pathId: `grade-${matchingImport.map.grade}`,
          pointId: matchingImport.point.id,
          results: matchingImport.entries.map(({ result }) => ({
            activityId: result.activityId,
            activityVersion: result.activityVersion,
            trust: 'client-unverified',
            stars: result.stars,
            correct: result.correct,
            total: result.total,
            completedAt: result.completedAt,
          })),
        })
        matchingImport.store.clearPoint(matchingImport.point.id)
        pendingImports = pendingImports.filter(pi => pi !== matchingImport)
        setActiveParentProfile(profile.id)
        window.location.href = `path.html?grade=${profile.grade}`
      } catch (error) {
        dashboardStatus.textContent = friendly(error)
        importButton.disabled = false
      }
    })
    article.append(importButton)
  }

  const editButton = document.createElement('button')
  editButton.type = 'button'
  editButton.className = 'parent-profile-card__edit'
  editButton.textContent = 'Редагувати профіль'
  editButton.setAttribute('aria-expanded', 'false')

  const editForm = document.createElement('form')
  editForm.className = 'parent-profile-edit hidden'
  const editId = `profile-edit-${profile.id}`
  editForm.setAttribute('aria-label', `Редагувати профіль ${profile.displayName || ''}`.trim())
  editForm.innerHTML = `
    <label for="${editId}-name">Ім’я профілю</label>
    <input id="${editId}-name" maxlength="60" autocomplete="off">
    <label for="${editId}-grade">Клас</label>
    <select id="${editId}-grade">
      <option value="1">1 клас</option><option value="2">2 клас</option>
      <option value="3">3 клас</option><option value="4">4 клас</option>
    </select>
    <p class="parent-error" role="alert" aria-live="assertive"></p>
    <div class="parent-profile-edit__actions">
      <button class="kid-action" type="submit">Зберегти</button>
      <button class="btn-ghost" type="button">Скасувати</button>
    </div>`
  const editName = editForm.querySelector<HTMLInputElement>('input')!
  const editGrade = editForm.querySelector<HTMLSelectElement>('select')!
  const editError = editForm.querySelector<HTMLElement>('.parent-error')!
  const cancelButton = editForm.querySelector<HTMLButtonElement>('.btn-ghost')!
  editName.value = profile.displayName ?? ''
  editGrade.value = String(profile.grade)

  const setEditing = (editing: boolean) => {
    editForm.classList.toggle('hidden', !editing)
    editButton.setAttribute('aria-expanded', String(editing))
    editButton.textContent = editing ? 'Закрити редагування' : 'Редагувати профіль'
    if (editing) editName.focus()
  }
  editButton.addEventListener('click', () => setEditing(editForm.classList.contains('hidden')))
  cancelButton.addEventListener('click', () => {
    editName.value = profile.displayName ?? ''
    editGrade.value = String(profile.grade)
    editError.textContent = ''
    setEditing(false)
  })
  editForm.addEventListener('submit', async event => {
    event.preventDefault()
    const submit = editForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
    const nextGrade = Number(editGrade.value) as 1 | 2 | 3 | 4
    editError.textContent = ''
    submit.disabled = true
    try {
      await updateParentProfile(profile.id, { displayName: editName.value.trim(), grade: nextGrade })
      if (profile.id === activeId && nextGrade !== profile.grade) setActiveParentProfile(null)
      await loadDashboard()
    } catch (error) {
      editError.textContent = friendly(error)
      submit.disabled = false
    }
  })
  article.append(editButton, editForm)
  return article
}

const TRACK_LABELS = {
  informatics: 'Інформатика',
  'computational-thinking': 'Обчислювальне мислення',
  'ai-basics': 'Основи ШІ',
} as const

function reportCard(profile: ParentProfile, item?: ParentMissionReport): HTMLElement {
  const article = document.createElement('article')
  article.className = 'parent-report-card'

  const title = document.createElement('h3')
  title.textContent = profile.displayName || 'Дитячий профіль'
  article.append(title)
  if (!item) {
    const empty = document.createElement('p')
    empty.className = 'parent-muted'
    empty.textContent = 'Після першої завершеної місії тут з’явиться короткий звіт.'
    article.append(empty)
    return article
  }

  const report = item.report
  const meta = document.createElement('p')
  meta.className = 'parent-report-card__meta'
  const date = new Date(item.createdAt)
  const dateLabel = Number.isNaN(date.getTime()) ? '' : ` · ${date.toLocaleDateString('uk-UA')}`
  meta.textContent = `${TRACK_LABELS[item.track]} · ${item.kind === 'practice' ? 'тренування' : 'пробна місія'}${dateLabel}`
  article.append(meta)

  if (typeof report.correct === 'number' && typeof report.total === 'number' && report.total > 0) {
    const score = document.createElement('p')
    score.className = 'parent-report-card__score'
    score.textContent = `${report.correct} із ${report.total} завдань виконано правильно`
    article.append(score)
  }
  const insight = report.strengths?.[0] || report.struggles?.[0]
  if (insight) {
    const text = document.createElement('p')
    text.textContent = insight
    article.append(text)
  }
  if (report.nextMission?.reason) {
    const next = document.createElement('p')
    next.className = 'parent-report-card__next'
    next.textContent = `Наступний крок: ${report.nextMission.reason}`
    article.append(next)
  }
  return article
}

async function loadOverview(profiles: ParentProfile[]) {
  entitlementRoot.textContent = 'Перевіряємо доступ…'
  reportsRoot.replaceChildren()
  try {
    const [entitlement, reportResponses] = await Promise.all([
      getParentEntitlement(),
      Promise.all(profiles.map(profile => getParentReports(profile.id))),
    ])
    entitlementRoot.classList.toggle('parent-access--active', entitlement.hasAccess)
    if (entitlement.hasAccess) {
      const end = entitlement.currentPeriodEnd ? new Date(entitlement.currentPeriodEnd) : null
      const endLabel = end && !Number.isNaN(end.getTime()) ? ` до ${end.toLocaleDateString('uk-UA')}` : ''
      entitlementRoot.textContent = `Домашній доступ активний${endLabel}`
    } else {
      entitlementRoot.textContent = 'Без активної підписки · пробні місії доступні'
    }
    reportsRoot.replaceChildren(...profiles.map((profile, index) => reportCard(profile, reportResponses[index]?.reports[0])))
    if (!profiles.length) {
      const empty = document.createElement('p')
      empty.className = 'parent-muted'
      empty.textContent = 'Додайте профіль дитини, щоб бачити її результати.'
      reportsRoot.append(empty)
    }
  } catch {
    entitlementRoot.textContent = 'Не вдалося оновити огляд'
    const error = document.createElement('p')
    error.className = 'parent-muted'
    error.textContent = 'Профілі доступні, але звіти тимчасово не завантажилися. Спробуйте оновити сторінку.'
    reportsRoot.replaceChildren(error)
  }
}

async function loadDashboard() {
  const session = getParentSession()
  if (!session) return showAuth('Сесія завершилася. Увійдіть знову.')
  authSection.classList.add('hidden')
  dashboard.classList.remove('hidden')
  $('parent-email').textContent = session.email
  dashboardStatus.textContent = 'Завантажуємо профілі…'
  try {
    const { profiles } = await listParentProfiles()
    const activeStillExists = profiles.some(profile => profile.id === session.activeChildProfileId)
    if (session.activeChildProfileId && !activeStillExists) setActiveParentProfile(null)
    const activeId = activeStillExists ? session.activeChildProfileId : null
    importRoot.classList.toggle('hidden', pendingImports.length === 0)
    if (pendingImports.length > 0) {
      const grades = pendingImports.map(pi => `${pi.map.grade} класу`).join(', ')
      const missingGrades = pendingImports.filter(
        pi => !profiles.some(p => p.grade === pi.map.grade),
      )
      if (missingGrades.length > 0) {
        const missing = missingGrades.map(pi => pi.map.grade).join(', ')
        const missingGrade = missingGrades[0].map.grade
        const createButton = document.createElement('button')
        createButton.className = 'parent-create-profile-inline'
        createButton.type = 'button'
        createButton.dataset['grade'] = String(missingGrade)
        createButton.textContent = `Створити профіль ${missingGrade} класу`
        createButton.addEventListener('click', () => {
          const gradeSelect = $<HTMLSelectElement>('parent-child-grade')
          gradeSelect.value = String(missingGrade)
          gradeSelect.closest('section')?.scrollIntoView({ behavior: 'smooth' })
          $<HTMLInputElement>('parent-child-name').focus()
        })
        importMessage.replaceChildren(
          document.createTextNode(`Знайдено завершену стартову точку для ${grades}. Для класу ${missing} ще немає профілю — `),
          createButton,
          document.createTextNode(', щоб зберегти місію.'),
        )
      } else {
        importMessage.textContent = `Знайдено завершену стартову точку для ${grades}. Оберіть профіль і підтвердьте збереження.`
      }
    }
    profilesRoot.replaceChildren(...profiles.map(profile => profileCard(profile, activeId)))
    await loadOverview(profiles)
    dashboardStatus.textContent = profiles.length
      ? 'Оберіть профіль дитини. Пароль дитині не потрібен.'
      : 'Додайте перший профіль дитини.'
  } catch (error) {
    dashboardStatus.textContent = friendly(error)
  }
}

async function init() {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken) {
    storeParentSession({ accessToken, refreshToken: refreshToken ?? '', email: '', activeChildProfileId: null })
    history.replaceState(null, '', window.location.pathname)
  }

  if (!getParentSession()) return showAuth()
  try {
    await registerParentAccount()
    await loadDashboard()
  } catch (error) {
    showAuth(friendly(error))
  }
}

$('parent-show-register').addEventListener('click', showRegister)
$('parent-show-login').addEventListener('click', showLogin)

loginForm.addEventListener('submit', async event => {
  event.preventDefault()
  const button = $<HTMLButtonElement>('parent-login-submit')
  loginError.textContent = ''
  button.disabled = true
  button.textContent = 'Входимо…'
  try {
    await loginParent(
      $<HTMLInputElement>('parent-login-email').value.trim(),
      $<HTMLInputElement>('parent-login-password').value,
    )
    await loadDashboard()
  } catch (error) {
    loginError.textContent = friendly(error)
  } finally {
    button.disabled = false
    button.textContent = 'Увійти'
  }
})

registerForm.addEventListener('submit', async event => {
  event.preventDefault()
  const button = $<HTMLButtonElement>('parent-register-submit')
  const password = $<HTMLInputElement>('parent-register-password').value
  registerError.textContent = ''
  registerError.classList.remove('parent-error--success')
  if (password.length < 8) {
    registerError.textContent = 'Пароль має містити щонайменше 8 символів.'
    return
  }
  const captchaToken = window.turnstile?.getResponse(turnstileWidgetId ?? undefined)
  if (!captchaToken) {
    registerError.textContent = 'Підтвердьте, що ви не робот.'
    return
  }
  button.disabled = true
  button.textContent = 'Створюємо…'
  try {
    await registerParentAuth($<HTMLInputElement>('parent-register-email').value.trim(), password, captchaToken)
    registerError.classList.add('parent-error--success')
    registerError.textContent = 'Перевірте пошту та підтвердьте email. Після цього поверніться й увійдіть.'
    registerForm.reset()
  } catch (error) {
    registerError.classList.remove('parent-error--success')
    registerError.textContent = friendly(error)
  } finally {
    window.turnstile?.reset(turnstileWidgetId ?? undefined)
    button.disabled = false
    button.textContent = 'Створити акаунт'
  }
})

profileForm.addEventListener('submit', async event => {
  event.preventDefault()
  const button = $<HTMLButtonElement>('parent-profile-submit')
  const grade = Number($<HTMLSelectElement>('parent-child-grade').value) as 1 | 2 | 3 | 4
  const displayName = $<HTMLInputElement>('parent-child-name').value.trim()
  profileError.textContent = ''
  button.disabled = true
  try {
    await createParentProfile({ ...(displayName ? { displayName } : {}), grade })
    profileForm.reset()
    $<HTMLSelectElement>('parent-child-grade').value = '2'
    await loadDashboard()
  } catch (error) {
    profileError.textContent = friendly(error)
  } finally {
    button.disabled = false
  }
})

$('parent-logout').addEventListener('click', async () => {
  await logoutParent()
  showLogin()
  showAuth()
})

void init()
