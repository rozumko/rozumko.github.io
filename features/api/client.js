const API_URL = 'https://rozumko-github-io.onrender.com'

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
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
