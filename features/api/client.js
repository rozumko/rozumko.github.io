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
  data.questions = data.questions.map(q => ({ ...q, a: q.options, correct: Number(q.correct) }))
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
 * Завершити спробу. Повертає: { score, total, results }
 */
export async function finishAttempt(attemptId) {
  return request(`/api/attempt/${attemptId}/finish`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
