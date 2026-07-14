import './frontend-security.js'
import {
  loginTeacher, logoutTeacher, getTeacherSession, getTeacherMe, getAdminStats,
} from './features/api/client.js'
import { initEventsTab,    loadEvents        } from './features/admin/events-tab.js'
import { initTeachersTab,  loadTeachers      } from './features/admin/teachers-tab.js'
import { initResultsTab,   loadResults       } from './features/admin/results-tab.js'
import { initQuestionsTab, loadQuestionsTab  } from './features/admin/questions-tab.js'
import { initMissionsTab,  loadMissionsTab   } from './features/admin/missions-tab.js'
import { initLessonsTab,   loadLessonsTab    } from './features/admin/lessons-tab.js'
import { initPathTab,      loadPathTab       } from './features/admin/path-tab.js'
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
      showDashboard(me.name || session.email)
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
    showDashboard(me.name || email)
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

// --- Tabs ---
document.querySelectorAll<HTMLElement>('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('tab-active'))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'))
    tab.classList.add('tab-active')
    const tabName = tab.dataset['tab']
    if (tabName) $maybe(`tab-${tabName}`)?.classList.remove('hidden')
    if (tabName === 'events')    loadEvents()
    if (tabName === 'teachers')  loadTeachers()
    if (tabName === 'results')   loadResults()
    if (tabName === 'questions') loadQuestionsTab()
    if (tabName === 'missions')  loadMissionsTab()
    if (tabName === 'lessons')   loadLessonsTab()
    if (tabName === 'path')      loadPathTab()
  })
})

// --- Dashboard ---
function showDashboard(nameOrEmail: string) {
  authSection.classList.add('hidden')
  adminPanel.classList.remove('hidden')
  emailDisplay.textContent = nameOrEmail
  refreshStats()
  loadEvents()
  loadTeachers()
  loadResults()
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
    const { teachers, codes, results, events } = await getAdminStats()
    $('stat-teachers').textContent = String(teachers)
    $('stat-students').textContent = String(codes)
    $('stat-results').textContent  = String(results)
    $('stat-events').textContent   = String(events ?? 0)
  } catch {
    // некритично
  }
}

initEventsTab({ refreshStats })
initTeachersTab()
initResultsTab()
initQuestionsTab()
initMissionsTab()
initLessonsTab()
initPathTab()
