import {
  loginTeacher, logoutTeacher, getTeacherSession, getTeacherMe, getAdminStats,
} from './features/api/client.js'
import { initEventsTab,    loadEvents        } from './features/admin/events-tab.js'
import { initTeachersTab,  loadTeachers      } from './features/admin/teachers-tab.js'
import { initResultsTab,   loadResults       } from './features/admin/results-tab.js'
import { initQuestionsTab, loadQuestionsTab  } from './features/admin/questions-tab.js'
import { friendlyError } from './features/admin/ui.js'
import { $, $maybe } from './utils/dom.js'

const authSection  = $('auth-section')
const adminPanel   = $('admin-panel')
const loginForm    = $<HTMLFormElement>('admin-login-form')
const loginError   = $('admin-login-error')
const loginBtn     = $<HTMLButtonElement>('admin-login-btn')
const logoutBtn    = $<HTMLButtonElement>('admin-logout-btn')
const emailDisplay = $('admin-email-display')

// --- Init ---
init()

async function init() {
  const session = getTeacherSession()
  if (session?.accessToken) {
    try {
      const me = await getTeacherMe()
      if (me.role !== 'admin') throw new Error('not admin')
      showDashboard(me.name || session.email)
    } catch {
      showAuth()
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
  try {
    await loginTeacher(email, password)
    const me = await getTeacherMe()
    if (me.role !== 'admin') {
      await logoutTeacher()
      throw new Error('Доступ тільки для адміністратора')
    }
    showDashboard(me.name || email)
  } catch (err) {
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
    if (tabName === 'teachers')  loadTeachers()
    if (tabName === 'results')   loadResults()
    if (tabName === 'questions') loadQuestionsTab()
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

function showAuth() {
  adminPanel.classList.add('hidden')
  authSection.classList.remove('hidden')
  loginBtn.disabled    = false
  loginBtn.textContent = 'Увійти'
}

async function refreshStats() {
  try {
    const { teachers, codes, results } = await getAdminStats()
    $('stat-teachers').textContent = String(teachers)
    $('stat-students').textContent = String(codes)
    $('stat-results').textContent  = String(results)
    $('stat-events').textContent   = '—'
  } catch {
    // некритично
  }
}

initEventsTab({ refreshStats })
initTeachersTab()
initResultsTab()
initQuestionsTab()
