const API_URL = import.meta.env.VITE_API_URL || 'https://rozumko-github-io.onrender.com'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ivcufigpmamgkfxwulzl.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_thaWciLcFJKxX3rcGbnGmg_2kLtAzNn'

// Cloudflare Turnstile SITE KEY (публічний — призначений для вставки у фронтенд).
// SECRET KEY сюди НЕ кладемо: він живе лише в Supabase → Authentication →
// Bot and Abuse Protection. Захист стає примусовим після увімкнення Turnstile там.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAADdbJzWWHyf-ABhd'

// ─── Types ─────────────────────────────────────────────────────────────────

export type QuestionType = 'choice' | 'truefalse' | 'input' | 'sort' | 'sequence' | 'match'
export type QuestionTrack = 'informatics' | 'computational-thinking' | 'ai-basics'

export interface Question {
  id: string
  q: string
  code?: string | null
  type?: QuestionType             // 'choice' якщо відсутній (legacy)
  options: string[] | Record<string, unknown>  // string[] для choice/truefalse; об'єкт для решти
  correct?: number | null         // null для input/sort/match; відсутній у відповіді для олімпіади
  explanation?: string | null
  difficulty?: string
  track?: QuestionTrack | null
  topic?: string | null           // предметна тема в межах track (docs/content-taxonomy.md)
  conceptKey?: string | null      // CT-навичка (крос-напрямкова)
  progressionBand?: 'recognize' | 'apply' | 'reason' | null
  version?: number
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

// Помилка API з HTTP-статусом і опційним кодом — щоб виклики (напр. authRequest)
// могли реагувати на 401 і виконати refresh токена.
export interface ApiError extends Error { status: number; code?: string }
function apiError(message: string, status: number, code?: string): ApiError {
  return Object.assign(new Error(message), { status, code })
}

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
    if (!res.ok) throw apiError(`Помилка сервера (${res.status}). Спробуйте пізніше.`, res.status)
    return {}
  }

  const data = await res.json()
  if (!res.ok) throw apiError(data.error ?? `Помилка ${res.status}`, res.status, data.code)
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
export function normalizeQuestion(q: Question): Question {
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
  grade, isOlympiad, count, difficulty, track, hideAnswers,
}: { grade?: number; isOlympiad?: boolean; count?: number; difficulty?: string; track?: QuestionTrack; hideAnswers?: boolean } = {}): Promise<Question[]> {
  const params = new URLSearchParams()
  if (grade      != null) params.set('grade',      String(grade))
  if (isOlympiad != null) params.set('isOlympiad', String(isOlympiad))
  if (count      != null) params.set('count',      String(count))
  if (difficulty)         params.set('difficulty', difficulty)
  if (track)              params.set('track',      track)
  if (hideAnswers != null) params.set('hideAnswers', String(hideAnswers))
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

// ─── School Mode (просунутий, анонімний учень) ─────────────────────────────

export async function joinSchoolSession(code: string, avatar: string, nickname: string): Promise<{
  participantId: string
  participantToken: string
  status: string
  grade: number
  questions: Question[]
  questionsCount: number
}> {
  const data = await request('/api/school/join', {
    method: 'POST',
    body: JSON.stringify({ code, avatar, nickname }),
  })
  data.questions = data.questions.map(normalizeQuestion)
  return data
}

export async function submitSchoolAnswer(
  participantId: string,
  participantToken: string,
  questionId: string,
  answer: number | string | number[],
): Promise<{ correct: boolean }> {
  return request(`/api/school/participants/${participantId}/answer`, {
    method: 'POST',
    headers: { 'X-Participant-Token': participantToken },
    body: JSON.stringify({ questionId, answer }),
  })
}

// ─── Home Mode (parent-led, зріз 1: лід + демо-звіт) ────────────────────────
// Контракт: docs/home-demo-contract.md. Сирі події + телеметрія йдуть на бекенд,
// скоринг і звіт рахує сервер. Клієнтська "правильність" не передається взагалі.

export type HomeDemoTrack = 'informatics' | 'computational-thinking' | 'ai-basics'

export interface HomeDemoEvent {
  questionId: string
  answer: number | string | number[]
  timeToAnswerMs: number
  answerChangeCount: number
  position: number
}

export interface HomeDemoAttemptPayload {
  missionId: string
  missionVersion: number
  track: HomeDemoTrack
  grade: 1 | 2 | 3 | 4
  startedAt: string
  finishedAt: string
  events: HomeDemoEvent[]
}

export interface HomeDemoReport {
  missionId: string
  missionVersion: number
  track: HomeDemoTrack
  correct: number
  total: number
  strengths: string[]
  struggles: string[]
  patterns: Array<{ kind: 'haste' | 'attention'; evidence: string }>
  nextMission: { missionId: string; reason: string }
}

export async function createHomeLead(
  parentEmail: string,
  consent: { policyVersion: string; acceptedAt: string },
  childProfile: { displayName?: string; grade: 1 | 2 | 3 | 4 },
): Promise<{ leadId: string; leadToken: string; childProfileId: string }> {
  return request('/api/home/leads', {
    method: 'POST',
    body: JSON.stringify({ parentEmail, consent, childProfile }),
  })
}

export async function submitHomeDemoReport(
  leadId: string,
  leadToken: string,
  payload: HomeDemoAttemptPayload,
): Promise<{ report: HomeDemoReport }> {
  return request(`/api/home/leads/${leadId}/demo-report`, {
    method: 'POST',
    headers: { 'X-Lead-Token': leadToken },
    body: JSON.stringify(payload),
  })
}

export async function getHomeDemoReport(leadId: string, leadToken: string): Promise<{ report: HomeDemoReport }> {
  return request(`/api/home/leads/${leadId}/demo-report`, {
    headers: { 'X-Lead-Token': leadToken },
  })
}

export type HomeEntitlementStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'expired' | 'revoked'

/** Стан платного доступу вирішує бекенд; клієнт лише відображає hasAccess. */
export async function getHomeEntitlement(leadId: string, leadToken: string): Promise<{
  status: HomeEntitlementStatus
  hasAccess: boolean
  currentPeriodEnd: string | null
}> {
  return request(`/api/home/leads/${leadId}/entitlement`, {
    headers: { 'X-Lead-Token': leadToken },
  })
}

export interface HomeClubState {
  status: HomeEntitlementStatus
  hasAccess: boolean
  currentPeriodEnd: string | null
  tracks: HomeDemoTrack[]
}

export async function getHomeClub(leadId: string, leadToken: string): Promise<HomeClubState> {
  return request(`/api/home/leads/${leadId}/club`, {
    headers: { 'X-Lead-Token': leadToken },
  })
}

export async function loadHomeClubQuestions(
  leadId: string,
  leadToken: string,
  params: { grade: number; count?: number; track: HomeDemoTrack; difficulty?: string },
): Promise<Question[]> {
  const p = new URLSearchParams()
  p.set('grade', String(params.grade))
  p.set('track', params.track)
  if (params.count != null) p.set('count', String(params.count))
  if (params.difficulty) p.set('difficulty', params.difficulty)
  const data = await request(`/api/home/leads/${leadId}/club/questions?${p}`, {
    headers: { 'X-Lead-Token': leadToken },
  })
  return data.questions.map(normalizeQuestion)
}

/** Платна practice-місія Club: гейт entitlement вирішує бекенд (403 без доступу). */
export async function submitHomeMissionReport(
  leadId: string,
  leadToken: string,
  payload: HomeDemoAttemptPayload,
): Promise<{ report: HomeDemoReport }> {
  return request(`/api/home/leads/${leadId}/mission-report`, {
    method: 'POST',
    headers: { 'X-Lead-Token': leadToken },
    body: JSON.stringify(payload),
  })
}

export interface HomeMissionAttemptSummary {
  missionId: string
  missionVersion: number
  track: HomeDemoTrack
  grade: number
  correct: number
  total: number
  report: HomeDemoReport
  createdAt: string
}

export async function listHomeMissionReports(leadId: string, leadToken: string): Promise<{ attempts: HomeMissionAttemptSummary[] }> {
  return request(`/api/home/leads/${leadId}/mission-reports`, {
    headers: { 'X-Lead-Token': leadToken },
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

export async function registerTeacher(email: string, password: string, school?: string, captchaToken?: string): Promise<any> {
  // CAPTCHA-токен GoTrue читає САМЕ з gotrue_meta_security.captcha_token (перевірено
  // проти живого Auth API). Плоский captcha_token ігнорується → "no captcha_token found".
  // У supabase-js цей же шлях відповідає options.captchaToken.
  const body: Record<string, unknown> = { email, password, data: { school: school || '' } }
  if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? data.msg ?? 'Помилка реєстрації')
  // Не зберігаємо сесію під час signup: на сторінці реєстрації виконується
  // сторонній Turnstile JS. Після підтвердження email користувач входить окремо
  // на чисто перезавантаженій сторінці без зовнішнього скрипта.
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

// Оновлення сесії вчителя через Supabase refresh-token grant.
// Один in-flight запит для всіх паралельних викликів: якщо кілька запитів
// одночасно впіймали 401, refresh відбувається РАЗ, решта чекає той самий проміс.
// Supabase ротує refresh-токен, тож зберігаємо новий (з fallback на старий).
let refreshInFlight: Promise<string | null> | null = null

function refreshTeacherSession(): Promise<string | null> {
  const session = getTeacherSession()
  if (!session?.refreshToken) return Promise.resolve(null)
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ refresh_token: session.refreshToken }),
        })
        if (!res.ok) return null
        const data = await res.json()
        if (!data.access_token) return null
        localStorage.setItem('teacher_session', JSON.stringify({
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? session.refreshToken,
          email: data.user?.email ?? session.email,
        }))
        return data.access_token as string
      } catch {
        return null
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

async function authRequest(path: string, options: RequestInit = {}): Promise<any> {
  const session = getTeacherSession()
  if (!session?.accessToken) throw new Error('Не авторизовано')

  const send = (token: string) => request(path, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, ...(options as any).headers },
  })

  try {
    return await send(session.accessToken)
  } catch (e) {
    // Лише протухлий/невалідний токен (401). 403 (pending/blocked) не ретраїмо.
    if ((e as ApiError)?.status !== 401) throw e
    const freshToken = await refreshTeacherSession()
    if (!freshToken) {
      localStorage.removeItem('teacher_session')
      throw new Error('Сесія завершилася. Увійдіть знову.')
    }
    return send(freshToken)
  }
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

// ─── School Mode (просунутий, вчитель) ─────────────────────────────────────

export interface SchoolSessionInfo {
  id: string
  joinCode: string
  grade: number
  difficulty: string | null
  questionsCount: number
  status: 'lobby' | 'active' | 'finished'
}

export interface SchoolParticipantRow {
  id: string
  avatar: string
  nickname: string
  score: number
}

export function createSchoolSession(data: { grade: number; difficulty?: string; questionsCount?: number }): Promise<{ session: SchoolSessionInfo }> {
  return authRequest('/api/school/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function startSchoolSession(id: string): Promise<{ status: string }> {
  return authRequest(`/api/school/sessions/${encodeURIComponent(id)}/start`, { method: 'POST', body: JSON.stringify({}) })
}

export function finishSchoolSession(id: string): Promise<{ status: string }> {
  return authRequest(`/api/school/sessions/${encodeURIComponent(id)}/finish`, { method: 'POST', body: JSON.stringify({}) })
}

export function getSchoolSession(id: string): Promise<{ session: SchoolSessionInfo; participants: SchoolParticipantRow[] }> {
  return authRequest(`/api/school/sessions/${encodeURIComponent(id)}`)
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

export interface Mission {
  id: string
  title: string
  kind: string
  track: QuestionTrack
  grade: number
  version: number
  status: 'draft' | 'active' | 'archived'
  config: Record<string, unknown> | null
  createdAt: string | null
  updatedAt: string | null
}

export function getAdminMissions(): Promise<{ missions: Mission[] }> {
  return authRequest('/api/admin/missions')
}

export function getAdminQuestions(params: { grade?: number | string; isOlympiad?: boolean | string; difficulty?: string; track?: QuestionTrack | string; topic?: string } = {}): Promise<{ questions: Question[] }> {
  const p = new URLSearchParams()
  if (params.grade      != null) p.set('grade',      String(params.grade))
  if (params.isOlympiad != null) p.set('isOlympiad', String(params.isOlympiad))
  if (params.difficulty)         p.set('difficulty', params.difficulty)
  if (params.track)              p.set('track',      String(params.track))
  if (params.topic)              p.set('topic',      params.topic)
  return authRequest(`/api/admin/questions?${p}`)
}
