const API_URL = 'https://rozumko-github-io.onrender.com'
const SUPABASE_URL = 'https://ivcufigpmamgkfxwulzl.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_thaWciLcFJKxX3rcGbnGmg_2kLtAzNn'

async function request(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    ...rest,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Помилка ${res.status}`)
  return data
}

/**
 * Обміняти код учня на спробу + питання.
 * Повертає: { attemptId, grade, questions }
 */
export async function exchangeCode(code) {
  const data = await request('/api/student/exchange-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  // Нормалізуємо поле options → a щоб question-renderer.js працював без змін
  data.questions = data.questions.map(q => ({ ...q, a: q.options }))
  return data
}

/**
 * Зберегти відповідь на питання.
 */
export async function saveAnswer(attemptId, questionId, answer) {
  return request(`/api/attempt/${attemptId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ questionId, answer }),
  })
}

/**
 * Завантажити питання для practice/demo.
 * @param {{ grade, isOlympiad, count, difficulty }} params
 */
export async function loadQuestions({ grade, isOlympiad, count, difficulty } = {}) {
  const params = new URLSearchParams()
  if (grade      != null) params.set('grade',      grade)
  if (isOlympiad != null) params.set('isOlympiad', isOlympiad)
  if (count      != null) params.set('count',      count)
  if (difficulty)         params.set('difficulty', difficulty)
  const data = await request(`/api/questions?${params}`)
  // Нормалізуємо options → a для question-renderer
  return data.questions.map(q => ({ ...q, a: q.options }))
}

/**
 * Завершити спробу. Повертає: { score, total, results }
 */
export async function finishAttempt(attemptId) {
  return request(`/api/attempt/${attemptId}/finish`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// ─── Teacher Auth (Supabase) ───────────────────────────────────────────────

export async function loginTeacher(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? data.msg ?? 'Помилка входу')
  localStorage.setItem('teacher_session', JSON.stringify({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    email: data.user?.email,
  }))
  return data
}

export function getTeacherSession() {
  try { return JSON.parse(localStorage.getItem('teacher_session')) } catch { return null }
}

export async function logoutTeacher() {
  const session = getTeacherSession()
  localStorage.removeItem('teacher_session')
  if (session?.accessToken) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.accessToken}`, 'apikey': SUPABASE_ANON_KEY },
    }).catch(() => {})
  }
}

function authRequest(path, options = {}) {
  const session = getTeacherSession()
  if (!session?.accessToken) throw new Error('Не авторизовано')
  return request(path, {
    ...options,
    headers: { 'Authorization': `Bearer ${session.accessToken}`, ...options.headers },
  })
}

export function getTeacherMe() {
  return authRequest('/api/teacher/me')
}

export function generateCodes({ grade, count, maxUses = 1 }) {
  return authRequest('/api/teacher/codes/generate', {
    method: 'POST',
    body: JSON.stringify({ grade, count, maxUses }),
  })
}

export function getTeacherCodes() {
  return authRequest('/api/teacher/codes')
}

export function getTeacherResults() {
  return authRequest('/api/teacher/results')
}

// ─── Admin API ─────────────────────────────────────────────────────────────

export function getAdminStats() {
  return authRequest('/api/admin/stats')
}

export function getAdminTeachers() {
  return authRequest('/api/admin/teachers')
}

export function getAdminResults() {
  return authRequest('/api/admin/results')
}

export function createQuestion(data) {
  return authRequest('/api/admin/questions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateQuestion(id, data) {
  return authRequest(`/api/admin/questions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteQuestion(id) {
  return authRequest(`/api/admin/questions/${id}`, { method: 'DELETE' })
}

export function getAdminQuestions(params = {}) {
  const p = new URLSearchParams()
  if (params.grade      != null) p.set('grade',      params.grade)
  if (params.isOlympiad != null) p.set('isOlympiad', params.isOlympiad)
  if (params.difficulty)         p.set('difficulty', params.difficulty)
  return authRequest(`/api/admin/questions?${p}`)
}
