import './frontend-security.js'
import {
  loginTeacher, logoutTeacher, getTeacherSession, getTeacherMe, getAdminStats,
} from './features/api/client.js'
import { initEventsTab,    loadEvents        } from './features/admin/events-tab.js'
import { initTeachersTab,  loadTeachers      } from './features/admin/teachers-tab.js'
import { initParentsTab,   loadParents       } from './features/admin/parents-tab.js'
import { initResultsTab,   loadResults       } from './features/admin/results-tab.js'
import { initQuestionsTab, loadQuestionsTab  } from './features/admin/questions-tab.js'
import { initMissionsTab,  loadMissionsTab   } from './features/admin/missions-tab.js'
import { initLessonsTab,   loadLessonsTab    } from './features/admin/lessons-tab.js'
import { initPathTab,      loadPathTab       } from './features/admin/path-tab.js'
import { initOutcomesTab,   loadOutcomesTab   } from './features/admin/outcomes-tab.js'
import { initCurriculumTab, loadCurriculumTab } from './features/admin/curriculum-tab.js'
import { initPublicationTab, loadPublicationTab, refreshContentDeliveryBanner } from './features/admin/publication-tab.js'
import { initFunnelPanel, loadFunnelPanel } from './features/admin/funnel-panel.js'
import { friendlyError } from './features/admin/ui.js'
import { $, $maybe } from './utils/dom.js'

const authSection  = $('auth-section')
const adminPanel   = $('admin-panel')
const loginForm    = $<HTMLFormElement>('admin-login-form')
const loginError   = $('admin-login-error')
const loginBtn     = $<HTMLButtonElement>('admin-login-btn')
const logoutBtn    = $<HTMLButtonElement>('admin-logout-btn')
const emailDisplay = $('admin-email-display')

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
      if (me.role !== 'admin') throw new Error('not admin')
      showDashboard(me.name || session.email, me.features?.lessonEngine === true)
    } catch {
      hideColdStartBanner()
      // authRequest чистить сесію, якщо refresh-токен теж мертвий. Тоді показуємо
      // явне повідомлення; транзієнтна помилка / не-адмін (сесія лишилась) — без нього.
      showAuth(getTeacherSession() ? undefined : 'Сесія завершилася. Увійдіть знову.')
    }
  } else {
    showAuth()
  }
}

// --- Login ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email    = $<HTMLInputElement>('admin-email').value.trim()
  const password = $<HTMLInputElement>('admin-password').value
  loginError.textContent = ''
  loginBtn.disabled    = true
  loginBtn.textContent = 'Вхід…'
  showColdStartBanner()
  try {
    await loginTeacher(email, password)
    const me = await getTeacherMe()
    hideColdStartBanner()
    if (me.role !== 'admin') {
      await logoutTeacher()
      throw new Error('Доступ тільки для адміністратора')
    }
    showDashboard(me.name || email, me.features?.lessonEngine === true)
  } catch (err) {
    hideColdStartBanner()
    loginError.textContent = friendlyError((err as Error).message)
    loginBtn.disabled    = false
    loginBtn.textContent = 'Увійти'
  }
})

// --- Logout ---
logoutBtn.addEventListener('click', async () => {
  await logoutTeacher()
  showAuth()
})

// --- Theme: light by default; public/admin-theme.js applies a saved choice before paint ---
const THEME_KEY = 'rozumko.admin.theme'
const themeToggle = $<HTMLButtonElement>('admin-theme-toggle')

function syncThemeToggle() {
  const dark = document.documentElement.dataset['adminTheme'] === 'dark'
  themeToggle.setAttribute('aria-pressed', String(dark))
  themeToggle.querySelector('i')!.className = dark ? 'fas fa-sun' : 'fas fa-moon'
}

themeToggle.addEventListener('click', () => {
  const dark = document.documentElement.dataset['adminTheme'] !== 'dark'
  document.documentElement.dataset['adminTheme'] = dark ? 'dark' : 'light'
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light') } catch { /* storage unavailable */ }
  syncThemeToggle()
})
syncThemeToggle()

// --- Tabs ---
// Each section loads its data when opened; the open section is kept in the
// URL hash, so a reload or a shared link returns to it.
const TAB_LOADERS: Record<string, () => unknown> = {
  overview: () => { void refreshStats(); loadFunnelPanel() },
  events: loadEvents,
  teachers: loadTeachers,
  parents: loadParents,
  results: loadResults,
  questions: loadQuestionsTab,
  missions: loadMissionsTab,
  lessons: loadLessonsTab,
  path: loadPathTab,
  outcomes: loadOutcomesTab,
  curriculum: loadCurriculumTab,
  publication: loadPublicationTab,
}
const moreToggle = $<HTMLButtonElement>('admin-more-toggle')
const moreTabs = $('admin-more-tabs')
const MORE_OPEN_KEY = 'rozumko.admin.moreSections'

function tabButton(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.admin-tab[data-tab="${CSS.escape(name)}"]`)
}

function setMoreOpen(open: boolean, remember = true) {
  moreTabs.hidden = !open
  moreToggle.setAttribute('aria-expanded', String(open))
  if (!remember) return
  try { localStorage.setItem(MORE_OPEN_KEY, open ? '1' : '0') } catch { /* storage unavailable */ }
}

function activateTab(name: string) {
  const tab = tabButton(name)
  if (!tab || tab.hidden) return
  // A parked section opened by link or reload shows its row without being remembered.
  if (moreTabs.contains(tab) && moreTabs.hidden) setMoreOpen(true, false)
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.classList.remove('tab-active')
    t.removeAttribute('aria-current')
  })
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'))
  tab.classList.add('tab-active')
  tab.setAttribute('aria-current', 'page')
  $maybe(`tab-${name}`)?.classList.remove('hidden')
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`)
  void TAB_LOADERS[name]?.()
}

document.querySelectorAll<HTMLElement>('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => { if (tab.dataset['tab']) activateTab(tab.dataset['tab']) })
})
moreToggle.addEventListener('click', () => setMoreOpen(moreTabs.hidden === true))
try { if (localStorage.getItem(MORE_OPEN_KEY) === '1') setMoreOpen(true, false) } catch { /* storage unavailable */ }

/** The section from the URL, else lessons (when served), else the overview. */
function initialTab(lessonEngine: boolean): string {
  const fromHash = location.hash.slice(1)
  const tab = fromHash ? tabButton(fromHash) : null
  if (tab && !tab.hidden) return fromHash
  return lessonEngine ? 'curriculum' : 'overview'
}

// --- Lesson Engine tabs: shown only when the backend serves the surface ---
function showLessonEngineTabs(enabled: boolean) {
  document.querySelectorAll<HTMLElement>('[data-lesson-engine]').forEach(tab => { tab.hidden = !enabled })
}

// --- Dashboard ---
function showDashboard(nameOrEmail: string, lessonEngine: boolean) {
  showLessonEngineTabs(lessonEngine)
  authSection.classList.add('hidden')
  adminPanel.classList.remove('hidden')
  emailDisplay.textContent = nameOrEmail
  void refreshContentDeliveryBanner()
  activateTab(initialTab(lessonEngine))
}

function showAuth(message?: string) {
  adminPanel.classList.add('hidden')
  authSection.classList.remove('hidden')
  loginBtn.disabled    = false
  loginBtn.textContent = 'Увійти'
  loginError.textContent = message ?? ''
}

async function refreshStats() {
  try {
    const { teachers, parents, codes, results, events } = await getAdminStats()
    $('stat-teachers').textContent = String(teachers)
    $('stat-parents').textContent = String(parents ?? 0)
    $('stat-students').textContent = String(codes)
    $('stat-results').textContent  = String(results)
    $('stat-events').textContent   = String(events ?? 0)
  } catch {
    // некритично
  }
}

initEventsTab({ refreshStats })
initTeachersTab()
initParentsTab()
initResultsTab()
initQuestionsTab()
initMissionsTab()
initLessonsTab()
initPathTab()
initOutcomesTab()
initCurriculumTab()
initPublicationTab()
initFunnelPanel()
