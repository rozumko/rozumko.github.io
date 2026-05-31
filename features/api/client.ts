const API_URL = 'https://rozumko-github-io.onrender.com'
const SUPABASE_URL = 'https://ivcufigpmamgkfxwulzl.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_thaWciLcFJKxX3rcGbnGmg_2kLtAzNn'

// ─── Types ─────────────────────────────────────────────────────────────────

export type QuestionType = 'choice' | 'truefalse' | 'input' | 'sort' | 'sequence' | 'match'

export interface Question {
  id: string
  q: string
  code?: string | null
  type?: QuestionType             // 'choice' якщо відсутній (legacy)
  options: string[] | Record<string, unknown>  // string[] для choice/truefalse; об'єкт для решти
  correct?: number                // відсутній для isOlympiad=true або type=input/sort/…
  explanation?: string | null
  difficulty?: string
  grade?: number
  isOlympiad?: boolean
  a?: string[]                    // normalized alias для question-renderer (choice/truefalse)
  img?: string | null
  [key: string]: unknown          // дозволяє передавати Question туди де очікується RenderableQuestion
}

export interface Attempt {
  id: string
  grade: number
  score: number | null
  totalQ: number | null
  status: string
  startedAt: string
  finishedAt: string | null
  code?: string
}

export interface TeacherSession {
  accessToken: string
  refreshToken: string
  email: string
}

export interface AccessCode {
  id: string
  eventId?: string | null
  registrationId?: string | null
  code: string
  grade: number
  maxUses: number
  usedCount: number
  expiresAt: string | null
  createdAt: string
  eventTitle?: string | null
}

export interface OlympiadEvent {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  timeMinutes: number
  questionsCount: number
  status: 'draft' | 'published' | 'active' | 'finished' | 'archived'
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type OlympiadEventInput = {
  title: string
  description?: string | null
  startsAt: string
  endsAt: string
  timeMinutes?: number
  questionsCount?: number
  status?: OlympiadEvent['status']
}

export type EventQuestion = Pick<Question, 'id' | 'q' | 'difficulty' | 'grade'> & {
  position: number
}

export type TeacherEvent = Pick<OlympiadEvent, 'id' | 'title' | 'startsAt' | 'endsAt' | 'status'>

export interface TeacherClass {
  id: string
  teacherId: string
  name: string
  grade: number
  createdAt: string
  updatedAt: string
}

export interface ClassStudent {
  id: string
  label: string
  createdAt: string
}

export interface EventRegistration {
  id: string
  eventId: string
  classId: string
  grade: number
  participantsCount: number
  paymentStatus: 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded'
  status: 'registered' | 'cancelled'
  createdAt: string
  eventTitle?: string
  className?: string
  codesCreatedCount?: number
}

// ─── Core request ──────────────────────────────────────────────────────────

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const { headers: extraHeaders, ...rest } = options as any
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      ...rest,
    })
  } catch {
    throw new Error('Немає з\'єднання з сервером. Перевірте інтернет.')
  }

  // Деякі відповіді можуть бути не JSON (502, 503 від проксі)
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new Error(`Помилка сервера (${res.status}). Спробуйте пізніше.`)
    return {}
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Помилка ${res.status}`)
  return data
}

// ─── Student API ───────────────────────────────────────────────────────────

export function validateCode(code: string): Promise<{ eventTitle: string; grade: number }> {
  return request(`/api/student/validate-code?code=${encodeURIComponent(code)}`)
}

// Нормалізує питання з API у форму, яку очікує question-renderer.
// Для choice/truefalse: options — масив рядків → дублюємо в q.a.
// Для sort/sequence/match/input: options — обʼєкт → розгортаємо його поля
// (items, correctOrder, left, right, pairs, given, choices, answer, inputType)
// у top-level q, бо рендерер читає саме звідти. Ключі відповідей для олімпіади
// сервер уже видалив з options, тож після розгортання їх просто не буде.
function normalizeQuestion(q: Question): Question {
  if (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) {
    return { ...q, ...(q.options as Record<string, unknown>) } as Question
  }
  return { ...q, a: q.options as string[] }
}

export async function exchangeCode(code: string): Promise<{
  attemptId: string
  attemptToken: string
  grade: number
  questions: Question[]
  resumed?: boolean
  answeredQuestionIds?: string[]
  remainingSeconds: number
  timeMinutes: number
  questionsCount: number
}> {
  const data = await request('/api/student/exchange-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  data.questions = data.questions.map(normalizeQuestion)
  return data
}

export async function saveAnswer(attemptId: string, attemptToken: string, questionId: string, answer: number | string | number[]): Promise<void> {
  return request(`/api/attempt/${attemptId}/answer`, {
    method: 'POST',
    headers: { 'X-Attempt-Token': attemptToken },
    body: JSON.stringify({ questionId, answer }),
  })
}

export async function loadQuestions({
  grade, isOlympiad, count, difficulty,
}: { grade?: number; isOlympiad?: boolean; count?: number; difficulty?: string } = {}): Promise<Question[]> {
  const params = new URLSearchParams()
  if (grade      != null) params.set('grade',      String(grade))
  if (isOlympiad != null) params.set('isOlympiad', String(isOlympiad))
  if (count      != null) params.set('count',      String(count))
  if (difficulty)         params.set('difficulty', difficulty)
  const data = await request(`/api/questions?${params}`)
  return data.questions.map(normalizeQuestion)
}

export async function finishAttempt(attemptId: string, attemptToken: string): Promise<{ score: number; total: number }> {
  return request(`/api/attempt/${attemptId}/finish`, {
    method: 'POST',
    headers: { 'X-Attempt-Token': attemptToken },
    body: JSON.stringify({}),
  })
}

// ─── Teacher Auth (Supabase) ───────────────────────────────────────────────

export async function loginTeacher(email: string, password: string): Promise<any> {
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

export async function registerTeacher(email: string, password: string, school?: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password, data: { school: school || '' } }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? data.msg ?? 'Помилка реєстрації')
  // Якщо Supabase повертає access_token — одразу зберігаємо сесію
  if (data.access_token) {
    localStorage.setItem('teacher_session', JSON.stringify({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      email: data.user?.email,
    }))
  }
  return data
}

export function getTeacherSession(): TeacherSession | null {
  try { return JSON.parse(localStorage.getItem('teacher_session') ?? 'null') } catch { return null }
}

export async function logoutTeacher(): Promise<void> {
  const session = getTeacherSession()
  localStorage.removeItem('teacher_session')
  if (session?.accessToken) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.accessToken}`, 'apikey': SUPABASE_ANON_KEY },
    }).catch(() => {})
  }
}

function authRequest(path: string, options: RequestInit = {}): Promise<any> {
  const session = getTeacherSession()
  if (!session?.accessToken) throw new Error('Не авторизовано')
  return request(path, {
    ...options,
    headers: { 'Authorization': `Bearer ${session.accessToken}`, ...(options as any).headers },
  })
}

export function getTeacherMe(): Promise<{ id: string; authUserId: string; role: string; name: string }> {
  return authRequest('/api/teacher/me')
}

export function getTeacherEvents(): Promise<{ events: TeacherEvent[] }> {
  return authRequest('/api/teacher/events')
}

export function getTeacherRegistrationEvents(): Promise<{ events: TeacherEvent[] }> {
  return authRequest('/api/teacher/registration-events')
}

export function getTeacherClasses(): Promise<{ classes: TeacherClass[] }> {
  return authRequest('/api/teacher/classes')
}

export function getClassStudents(classId: string): Promise<{ students: ClassStudent[] }> {
  return authRequest(`/api/teacher/classes/${classId}/students`)
}

export function addClassStudent(classId: string, label: string): Promise<{ student: ClassStudent }> {
  return authRequest(`/api/teacher/classes/${classId}/students`, {
    method: 'POST',
    body: JSON.stringify({ label }),
  })
}

export function updateClassStudent(studentId: string, label: string): Promise<{ student: ClassStudent }> {
  return authRequest(`/api/teacher/students/${studentId}`, {
    method: 'PUT',
    body: JSON.stringify({ label }),
  })
}

export function deleteClassStudent(studentId: string): Promise<void> {
  return authRequest(`/api/teacher/students/${studentId}`, { method: 'DELETE' })
}

export function createTeacherClass(data: { name: string; grade: number }): Promise<{ class: TeacherClass }> {
  return authRequest('/api/teacher/classes', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function getTeacherRegistrations(): Promise<{ registrations: EventRegistration[] }> {
  return authRequest('/api/teacher/registrations')
}

export function createTeacherRegistration(data: {
  eventId: string
  classId: string
  participantsCount: number
  // paymentStatus не надсилається: статус оплати визначає сервер.
}): Promise<{ registration: EventRegistration }> {
  return authRequest('/api/teacher/registrations', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function cancelTeacherRegistration(registrationId: string): Promise<{ registration: EventRegistration }> {
  return authRequest(`/api/teacher/registrations/${encodeURIComponent(registrationId)}`, {
    method: 'DELETE',
  })
}

export function generateCodes({ registrationId, maxUses = 1 }: { registrationId: string; maxUses?: number }): Promise<{ codes: Pick<AccessCode, 'id' | 'code'>[] }> {
  return authRequest('/api/teacher/codes/generate', {
    method: 'POST',
    body: JSON.stringify({ registrationId, maxUses }),
  })
}

export function getTeacherCodes(registrationId?: string): Promise<{ codes: AccessCode[] }> {
  const qs = registrationId ? `?registrationId=${encodeURIComponent(registrationId)}` : ''
  return authRequest(`/api/teacher/codes${qs}`)
}

export function getTeacherResults(): Promise<{ results: Attempt[] }> {
  return authRequest('/api/teacher/results')
}

// ─── Admin API ─────────────────────────────────────────────────────────────

export function getAdminStats(): Promise<{ teachers: number; codes: number; results: number; events?: number }> {
  return authRequest('/api/admin/stats')
}

export function getAdminTeachers(): Promise<{ teachers: { id: string; email: string; name: string | null; status: string; createdAt: string }[] }> {
  return authRequest('/api/admin/teachers')
}

export function setTeacherStatus(id: string, status: 'active' | 'blocked'): Promise<{ id: string; status: string }> {
  return authRequest(`/api/admin/teachers/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export function getAdminResults(): Promise<{ results: Attempt[] }> {
  return authRequest('/api/admin/results')
}

export function getAdminEvents(): Promise<{ events: OlympiadEvent[] }> {
  return authRequest('/api/admin/events')
}

export function createEvent(data: OlympiadEventInput): Promise<{ event: OlympiadEvent }> {
  return authRequest('/api/admin/events', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateEvent(id: string, data: Partial<OlympiadEventInput>): Promise<{ event: OlympiadEvent }> {
  return authRequest(`/api/admin/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function getEventQuestions(eventId: string, grade: number): Promise<{ questions: EventQuestion[] }> {
  return authRequest(`/api/admin/events/${eventId}/questions?grade=${grade}`)
}

export function setEventQuestions(eventId: string, data: { grade: number; questionIds: string[] }): Promise<{ saved: boolean; count: number }> {
  return authRequest(`/api/admin/events/${eventId}/questions`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function createQuestion(data: Omit<Question, 'id' | 'a'>): Promise<{ id: string }> {
  return authRequest('/api/admin/questions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateQuestion(id: string, data: Partial<Omit<Question, 'id' | 'a'>>): Promise<{ id: string }> {
  return authRequest(`/api/admin/questions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteQuestion(id: string): Promise<void> {
  return authRequest(`/api/admin/questions/${id}`, { method: 'DELETE' })
}

export function getAdminQuestions(params: { grade?: number | string; isOlympiad?: boolean | string; difficulty?: string } = {}): Promise<{ questions: Question[] }> {
  const p = new URLSearchParams()
  if (params.grade      != null) p.set('grade',      String(params.grade))
  if (params.isOlympiad != null) p.set('isOlympiad', String(params.isOlympiad))
  if (params.difficulty)         p.set('difficulty', params.difficulty)
  return authRequest(`/api/admin/questions?${p}`)
}
