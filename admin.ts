// TODO: додати типи HTMLInputElement/HTMLButtonElement до DOM-запитів при наступному рефакторингу
// @ts-nocheck
import {
  loginTeacher, logoutTeacher, getTeacherSession, getTeacherMe, getAdminStats,
} from './features/api/client.js'
import { initEventsTab,    loadEvents        } from './features/admin/events-tab.js'
import { initTeachersTab,  loadTeachers      } from './features/admin/teachers-tab.js'
import { initResultsTab,   loadResults       } from './features/admin/results-tab.js'
import { initQuestionsTab, loadQuestionsTab  } from './features/admin/questions-tab.js'
import { friendlyError } from './features/admin/ui.js'

const authSection  = document.getElementById('auth-section')
const adminPanel   = document.getElementById('admin-panel')
const loginForm    = document.getElementById('admin-login-form')
const loginError   = document.getElementById('admin-login-error')
const loginBtn     = document.getElementById('admin-login-btn')
const logoutBtn    = document.getElementById('admin-logout-btn')
const emailDisplay = document.getElementById('admin-email-display')

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
  const email    = document.getElementById('admin-email').value.trim()
  const password = document.getElementById('admin-password').value
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
    loginError.textContent = friendlyError(err.message)
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
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('tab-active'))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'))
    tab.classList.add('tab-active')
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden')
    if (tab.dataset.tab === 'teachers')  loadTeachers()
    if (tab.dataset.tab === 'results')   loadResults()
    if (tab.dataset.tab === 'questions') loadQuestionsTab()
  })
})

// --- Dashboard ---
function showDashboard(nameOrEmail) {
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
    document.getElementById('stat-teachers').textContent = teachers
    document.getElementById('stat-students').textContent = codes
    document.getElementById('stat-results').textContent  = results
    document.getElementById('stat-events').textContent   = '—'
  } catch {
    // некритично
  }
}

initEventsTab({ refreshStats })
initTeachersTab()
initResultsTab()
initQuestionsTab()
