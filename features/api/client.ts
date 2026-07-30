import {
  beginPkce,
  clearPendingPkce,
  readPendingPkce,
  type AuthRedirectFlow,
  type AuthSurface,
} from '../auth/pkce.js'

const ENV: Partial<ImportMetaEnv> = import.meta.env ?? {}
const API_URL = ENV.VITE_API_URL || 'https://rozumko-github-io.onrender.com'
const SUPABASE_URL = ENV.VITE_SUPABASE_URL || 'https://ivcufigpmamgkfxwulzl.supabase.co'
const SUPABASE_ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY || 'sb_publishable_thaWciLcFJKxX3rcGbnGmg_2kLtAzNn'

// Cloudflare Turnstile SITE KEY (публічний — призначений для вставки у фронтенд).
// SECRET KEY сюди НЕ кладемо: він живе лише в Supabase → Authentication →
// Bot and Abuse Protection. Захист стає примусовим після увімкнення Turnstile там.
export const TURNSTILE_SITE_KEY = ENV.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAADdbJzWWHyf-ABhd'

// ─── Types ─────────────────────────────────────────────────────────────────

export type QuestionType = 'choice' | 'truefalse' | 'input' | 'sort' | 'sequence' | 'match'
export type QuestionTrack = 'informatics' | 'computational-thinking' | 'ai-basics'
/** Progression stage of an item. Mirrors PROGRESSION_BANDS in backend/src/lib/taxonomy.ts. */
export type ProgressionBand = 'recognize' | 'apply' | 'reason'
export type QuestionChannel = 'class_game' | 'path' | 'olympiad_training'
export type PublicQuestionChannel = Exclude<QuestionChannel, 'class_game'>

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
  progressionBand?: ProgressionBand | null
  version?: number
  editVersion?: number
  editorialStatus?: 'draft' | 'review' | 'published' | 'archived'
  grade?: number
  isOlympiad?: boolean
  channels?: QuestionChannel[]
  a?: string[]                    // normalized alias для question-renderer (choice/truefalse)
  img?: string | null
  imageAlt?: string | null
  updatedAt?: string | null
  publishedAt?: string | null
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

export interface ParentSession {
  accessToken: string
  refreshToken: string
  email: string
  activeChildProfileId: string | null
}

const TEACHER_SESSION_KEY = 'teacher_session'
let teacherSessionMemory: TeacherSession | null = null
const PARENT_SESSION_KEY = 'parent_session'
let parentSessionMemory: ParentSession | null = null

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
    // Content-Type only when something is actually sent. Fastify rejects an empty
    // body that claims to be JSON (FST_ERR_CTP_EMPTY_JSON_BODY), and the server
    // masks that as a bare "Невірний запит" — which is what every bodiless DELETE
    // used to hit. It also spares those requests a CORS preflight.
    res = await fetch(`${API_URL}${path}`, {
      headers: {
        ...(rest.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...extraHeaders,
      },
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
  grade, isOlympiad, channel, count, difficulty, track, hideAnswers,
}: { grade?: number; isOlympiad?: boolean; channel?: PublicQuestionChannel; count?: number; difficulty?: string; track?: QuestionTrack; hideAnswers?: boolean } = {}): Promise<Question[]> {
  const params = new URLSearchParams()
  if (grade      != null) params.set('grade',      String(grade))
  if (isOlympiad != null) params.set('isOlympiad', String(isOlympiad))
  if (channel)            params.set('channel',     channel)
  if (count      != null) params.set('count',      String(count))
  if (difficulty)         params.set('difficulty', difficulty)
  if (track)              params.set('track',      track)
  if (hideAnswers != null) params.set('hideAnswers', String(hideAnswers))
  const data = await request(`/api/questions?${params}`)
  return data.questions.map(normalizeQuestion)
}

export async function startOlympiadDemo(grade: number): Promise<{
  demoToken: string
  tokenExpiresAt: number
  tokenTtlMs: number
  questions: Question[]
  timeMinutes: number
  questionsCount: number
}> {
  const data = await request('/api/questions/demo/start', {
    method: 'POST',
    body: JSON.stringify({ grade }),
  })
  data.questions = data.questions.map(normalizeQuestion)
  return data
}

export async function finishOlympiadDemo(
  demoToken: string,
  answers: Array<{ questionId: string; answer: number | string | number[] }>,
): Promise<{ score: number; total: number }> {
  return request('/api/questions/demo/finish', {
    method: 'POST',
    body: JSON.stringify({ demoToken, answers }),
  })
}

export async function finishAttempt(attemptId: string, attemptToken: string): Promise<{ score: number; total: number }> {
  return request(`/api/attempt/${attemptId}/finish`, {
    method: 'POST',
    headers: { 'X-Attempt-Token': attemptToken },
    body: JSON.stringify({}),
  })
}

// Пульс: сервер кредитує паузу (блекаути) і повертає авторитетний залишок часу.
// Кидає ApiError зі status 410, коли час вичерпано.
export async function sendHeartbeat(attemptId: string, attemptToken: string): Promise<{ pausedSeconds: number; remainingSeconds: number | null }> {
  return request(`/api/attempt/${attemptId}/heartbeat`, {
    method: 'POST',
    headers: { 'X-Attempt-Token': attemptToken },
    body: JSON.stringify({}),
  })
}

// ─── School Mode (просунутий, анонімний учень) ─────────────────────────────

/** What the session delivers: a graded quiz or a procedural activity. */
export type SchoolSessionKind = 'questions' | 'activity'

export async function joinSchoolSession(code: string, avatar: string, nickname: string): Promise<{
  participantId: string
  participantToken: string
  status: 'lobby' | 'active' | 'finished'
  grade: number
  kind: SchoolSessionKind
  activityKey: string | null
  activityLevel: string | null
  questions: Question[]
  questionsCount: number
}> {
  const data = await request('/api/school/join', {
    method: 'POST',
    body: JSON.stringify({ code, avatar, nickname }),
  })
  data.questions = (data.questions ?? []).map(normalizeQuestion)
  return data
}

export async function getSchoolParticipantSession(participantId: string, participantToken: string): Promise<{
  status: 'lobby' | 'active' | 'finished'
  grade: number
  kind: SchoolSessionKind
  activityKey: string | null
  activityLevel: string | null
  questions: Question[]
  questionsCount: number
  // Resume after reload: the participant's own answered ids + server score
  score?: number
  answeredQuestionIds?: string[]
  /** Activity sessions: this child already reported a result. */
  activityDone?: boolean
}> {
  const data = await request(`/api/school/participants/${encodeURIComponent(participantId)}/session`, {
    headers: { 'X-Participant-Token': participantToken },
  })
  data.questions = (data.questions ?? []).map(normalizeQuestion)
  return data
}

export function updateSchoolParticipantAvatar(
  participantId: string,
  participantToken: string,
  avatar: string,
): Promise<{ avatar: string }> {
  return request(`/api/school/participants/${encodeURIComponent(participantId)}/avatar`, {
    method: 'PATCH',
    headers: { 'X-Participant-Token': participantToken },
    body: JSON.stringify({ avatar }),
  })
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

/**
 * Final result of a class activity. Procedural games have no answer key, so the
 * browser reports the outcome and the server clamps it against its registry.
 * Stored as client-unverified evidence for the teacher only.
 */
export function submitSchoolActivityResult(
  participantId: string,
  participantToken: string,
  result: { correct: number; total: number; mistakes: number; durationSec: number },
): Promise<{ stars: number; correct: number; total: number }> {
  return request(`/api/school/participants/${encodeURIComponent(participantId)}/activity-result`, {
    method: 'POST',
    headers: { 'X-Participant-Token': participantToken },
    body: JSON.stringify(result),
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

// ── Воронка Home Mode ───────────────────────────────────────────────────────
// Знеособлений лічильник кроку: сервер тримає лише агрегати
// (дата × крок × клас × напрям), жодного ідентифікатора відвідувача не існує.
// Контракт межі — backend/src/routes/home-funnel.ts.
export const HOME_FUNNEL_STEPS = [
  'home_open', 'path_start', 'practice_start',
  'practice_complete', 'parent_gate_view', 'parent_lead',
] as const
export type HomeFunnelStep = typeof HOME_FUNNEL_STEPS[number]

/**
 * Fire-and-forget: телеметрія ніколи не має затримати або зламати екран дитини,
 * тож помилка мережі тут — не подія. `keepalive` доносить лічильник, навіть
 * якщо сторінка закривається одразу після кроку.
 */
export function recordHomeFunnelStep(
  step: HomeFunnelStep,
  dims: { grade?: number; track?: HomeDemoTrack } = {},
): void {
  const body: Record<string, unknown> = { step }
  if (dims.grade && dims.grade >= 1 && dims.grade <= 4) body.grade = dims.grade
  if (dims.track) body.track = dims.track

  try {
    void fetch(`${API_URL}/api/home/funnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {})
  } catch { /* телеметрія не має права ламати сторінку */ }
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
): Promise<{ report: HomeDemoReport; emailSent?: boolean }> {
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

// ─── Parent account API ────────────────────────────────────────────────────

export interface ParentProfile {
  id: string
  displayName: string | null
  grade: 1 | 2 | 3 | 4
}

export interface ParentPathActivityResult {
  activityId: string
  activityVersion: number
  contentVersion?: number
  trust: 'client-unverified'
  stars: number
  correct: number
  total: number
  completedAt: string
}

export interface ParentPathProgress {
  pointId: string
  status: 'completed'
  bestStars: number
  attempts: number
  updatedAt: string
}

export function storeParentSession(session: ParentSession): void {
  parentSessionMemory = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken ?? '',
    email: session.email ?? '',
    activeChildProfileId: session.activeChildProfileId ?? null,
  }
  try { sessionStorage.setItem(PARENT_SESSION_KEY, JSON.stringify(parentSessionMemory)) } catch { /* unavailable */ }
  try { localStorage.removeItem(PARENT_SESSION_KEY) } catch { /* remove legacy/accidental persistence */ }
}

export function getParentSession(): ParentSession | null {
  if (parentSessionMemory) return parentSessionMemory
  try {
    const raw = sessionStorage.getItem(PARENT_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ParentSession>
    if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') {
      clearParentSession()
      return null
    }
    parentSessionMemory = {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      email: typeof parsed.email === 'string' ? parsed.email : '',
      activeChildProfileId: typeof parsed.activeChildProfileId === 'string' ? parsed.activeChildProfileId : null,
    }
    return parentSessionMemory
  } catch {
    clearParentSession()
    return null
  }
}

export function setActiveParentProfile(childProfileId: string | null): void {
  const session = getParentSession()
  if (!session) throw new Error('Не авторизовано')
  storeParentSession({ ...session, activeChildProfileId: childProfileId })
}

export function clearParentSession(): void {
  parentSessionMemory = null
  try { sessionStorage.removeItem(PARENT_SESSION_KEY) } catch { /* unavailable */ }
  try { localStorage.removeItem(PARENT_SESSION_KEY) } catch { /* remove legacy/accidental persistence */ }
}

let parentRefreshInFlight: Promise<string | null> | null = null

async function refreshParentSession(): Promise<string | null> {
  const session = getParentSession()
  if (!session?.refreshToken) return null
  if (!parentRefreshInFlight) {
    parentRefreshInFlight = (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ refresh_token: session.refreshToken }),
        })
        if (!res.ok) return null
        const data = await res.json()
        if (!data.access_token) return null
        storeParentSession({
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? session.refreshToken,
          email: data.user?.email ?? session.email,
          activeChildProfileId: session.activeChildProfileId,
        })
        return data.access_token as string
      } catch {
        return null
      } finally {
        parentRefreshInFlight = null
      }
    })()
  }
  return parentRefreshInFlight
}

async function parentAuthRequest(path: string, options: RequestInit = {}): Promise<any> {
  const session = getParentSession()
  if (!session?.accessToken) throw new Error('Не авторизовано')
  const send = (token: string) => request(path, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, ...(options as any).headers },
  })
  try {
    return await send(session.accessToken)
  } catch (error) {
    if ((error as ApiError)?.status !== 401) throw error
    const token = await refreshParentSession()
    if (!token) {
      clearParentSession()
      throw new Error('Сесія завершилася. Увійдіть знову.')
    }
    return send(token)
  }
}

export function registerParentAccount(): Promise<{ status: 'active' | 'disabled'; email: string; emailVerified: boolean }> {
  return parentAuthRequest('/api/parent/register', { method: 'POST', body: JSON.stringify({}) })
}

export function getParentMe(): Promise<{ status: 'none' | 'active' | 'disabled'; email?: string; emailVerified?: boolean }> {
  return parentAuthRequest('/api/parent/me')
}

export function listParentProfiles(): Promise<{ profiles: ParentProfile[] }> {
  return parentAuthRequest('/api/parent/profiles')
}

export function createParentProfile(input: { displayName?: string; grade: 1 | 2 | 3 | 4 }): Promise<ParentProfile> {
  return parentAuthRequest('/api/parent/profiles', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateParentProfile(
  childProfileId: string,
  input: { displayName?: string; grade?: 1 | 2 | 3 | 4 },
): Promise<ParentProfile> {
  return parentAuthRequest(`/api/parent/profiles/${encodeURIComponent(childProfileId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function getParentEntitlement(): Promise<{
  status: HomeEntitlementStatus
  hasAccess: boolean
  currentPeriodEnd: string | null
}> {
  return parentAuthRequest('/api/parent/entitlement')
}

export interface ParentMissionReport {
  missionId: string
  track: HomeDemoTrack
  grade: number
  kind: 'demo' | 'practice'
  createdAt: string
  report: Partial<HomeDemoReport> & { correct?: number; total?: number }
}

export function getParentReports(childProfileId: string): Promise<{
  childProfileId: string
  reports: ParentMissionReport[]
}> {
  return parentAuthRequest(`/api/parent/profiles/${encodeURIComponent(childProfileId)}/reports`)
}

export function getParentPathProgress(childProfileId: string, pathId: string): Promise<{
  childProfileId: string
  pathId: string
  progress: ParentPathProgress[]
}> {
  return parentAuthRequest(`/api/parent/profiles/${encodeURIComponent(childProfileId)}/path-progress?pathId=${encodeURIComponent(pathId)}`)
}

export function submitParentPathProgress(
  childProfileId: string,
  payload: { pathId: string; pathVersion: number; pointId: string; results: ParentPathActivityResult[] },
): Promise<ParentPathProgress & { trust: 'client-unverified'; duplicate: boolean }> {
  return parentAuthRequest(`/api/parent/profiles/${encodeURIComponent(childProfileId)}/path-progress`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function loginParent(email: string, password: string, captchaToken?: string): Promise<void> {
  // Supabase captcha protection covers the password grant as well.
  const body: Record<string, unknown> = { email, password }
  if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? data.msg ?? 'Помилка входу')
  storeParentSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    email: data.user?.email ?? email,
    activeChildProfileId: null,
  })
}

export async function registerParentAuth(email: string, password: string, captchaToken?: string): Promise<void> {
  const { codeChallenge, codeChallengeMethod } = await beginPkce('parent', 'signup')
  const body: Record<string, unknown> = {
    email,
    password,
    data: { account_type: 'parent' },
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  }
  if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken }
  const redirect = typeof window !== 'undefined' ? `${window.location.origin}/parent.html` : ''
  const query = redirect ? `?redirect_to=${encodeURIComponent(redirect)}` : ''
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    clearPendingPkce('parent')
    throw new Error(data.error_description ?? data.msg ?? 'Помилка реєстрації')
  }
}

export async function logoutParent(): Promise<void> {
  const session = getParentSession()
  clearParentSession()
  if (session?.accessToken) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.accessToken}`, 'apikey': SUPABASE_ANON_KEY },
    }).catch(() => {})
  }
}

// ─── Shared Supabase Auth helpers (teacher + parent) ────────────────────────

/**
 * Requests a password-recovery email for an S256 PKCE flow. Supabase redirects
 * back with a one-time code; CAPTCHA uses the signup body contract.
 */
export async function requestPasswordReset(
  email: string,
  redirectPath: string,
  surface: AuthSurface,
  captchaToken?: string,
): Promise<void> {
  const { codeChallenge, codeChallengeMethod } = await beginPkce(surface, 'recovery')
  const body: Record<string, unknown> = {
    email,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  }
  if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken }
  const redirect = typeof window !== 'undefined' ? `${window.location.origin}/${redirectPath}` : ''
  const query = redirect ? `?redirect_to=${encodeURIComponent(redirect)}` : ''
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    clearPendingPkce(surface)
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error_description ?? data.msg ?? 'Не вдалося надіслати лист відновлення')
  }
}

export type AuthEmailActionType = 'signup' | 'recovery'

/** Builds the single trusted provider URL used after the local confirmation page. */
export function buildAuthConfirmationUrl(
  tokenHash: string,
  type: AuthEmailActionType,
  redirectTo: string,
): string {
  const verificationUrl = new URL('/auth/v1/verify', SUPABASE_URL)
  verificationUrl.searchParams.set('token', tokenHash)
  verificationUrl.searchParams.set('type', type)
  verificationUrl.searchParams.set('redirect_to', redirectTo)
  return verificationUrl.href
}

/** Sets a new password for the session obtained from the recovery link. */
export async function updateAuthPassword(accessToken: string, newPassword: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ password: newPassword }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error_description ?? data.msg ?? 'Не вдалося змінити пароль')
  }
}

/**
 * URL for Google OAuth sign-in via Supabase PKCE. The callback receives a
 * single-use authorization code; bearer tokens from URL fragments are rejected.
 */
export async function googleSignInUrl(redirectPath: string, surface: AuthSurface): Promise<string> {
  const { codeChallenge, codeChallengeMethod } = await beginPkce(surface, 'oauth')
  const redirect = `${window.location.origin}/${redirectPath}`
  const query = new URLSearchParams({
    provider: 'google',
    redirect_to: redirect,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  })
  return `${SUPABASE_URL}/auth/v1/authorize?${query.toString()}`
}

export interface AuthCodeExchange {
  accessToken: string
  refreshToken: string
  email: string
  flow: AuthRedirectFlow
}

/** Exchanges a PKCE code only when this browser initiated the matching flow. */
export async function exchangeAuthCode(surface: AuthSurface, authCode: string): Promise<AuthCodeExchange> {
  const pending = readPendingPkce(surface)
  if (!pending) {
    throw new Error('Запит на вхід не знайдено або він застарів. Почніть вхід ще раз.')
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ auth_code: authCode, code_verifier: pending.verifier }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') {
    throw new Error(data.error_description ?? data.msg ?? 'Не вдалося завершити безпечний вхід')
  }

  clearPendingPkce(surface)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    email: typeof data.user?.email === 'string' ? data.user.email : '',
    flow: pending.flow,
  }
}

// ─── Teacher Auth (Supabase) ───────────────────────────────────────────────

export async function loginTeacher(email: string, password: string, captchaToken?: string): Promise<any> {
  // Supabase captcha protection covers the password grant as well;
  // gotrue_meta_security is the same contract as signup/recover.
  const body: Record<string, unknown> = { email, password }
  if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? data.msg ?? 'Помилка входу')
  storeTeacherSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    email: data.user?.email,
  })
  return data
}

export async function registerTeacher(email: string, password: string, school?: string, captchaToken?: string): Promise<any> {
  // GoTrue reads CAPTCHA from gotrue_meta_security.captcha_token, matching
  // supabase-js options.captchaToken; a top-level captcha_token is ignored.
  const { codeChallenge, codeChallengeMethod } = await beginPkce('teacher', 'signup')
  const body: Record<string, unknown> = {
    email,
    password,
    data: { school: school || '' },
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  }
  if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken }
  // Confirmation email should land back on the teacher cabinet, not the Site URL.
  const redirect = typeof window !== 'undefined' ? `${window.location.origin}/teacher.html` : ''
  const query = redirect ? `?redirect_to=${encodeURIComponent(redirect)}` : ''
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    clearPendingPkce('teacher')
    throw new Error(data.error_description ?? data.msg ?? 'Помилка реєстрації')
  }
  // Signup never stores a session in the Turnstile document. The confirmation
  // callback exchanges its PKCE code, then reloads before authenticated work.
  return data
}

export function storeTeacherSession(session: TeacherSession): void {
  teacherSessionMemory = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken ?? '',
    email: session.email ?? '',
  }
  try { sessionStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify(teacherSessionMemory)) } catch { /* sessionStorage unavailable */ }
  try { localStorage.removeItem(TEACHER_SESSION_KEY) } catch { /* legacy storage unavailable */ }
}

function clearTeacherSession(): void {
  teacherSessionMemory = null
  try { sessionStorage.removeItem(TEACHER_SESSION_KEY) } catch { /* sessionStorage unavailable */ }
  try { localStorage.removeItem(TEACHER_SESSION_KEY) } catch { /* legacy storage unavailable */ }
}

export function getTeacherSession(): TeacherSession | null {
  if (teacherSessionMemory) return teacherSessionMemory

  try {
    const raw = sessionStorage.getItem(TEACHER_SESSION_KEY)
    if (raw) {
      teacherSessionMemory = JSON.parse(raw)
      return teacherSessionMemory
    }
  } catch {
    teacherSessionMemory = null
    try { sessionStorage.removeItem(TEACHER_SESSION_KEY) } catch { /* sessionStorage unavailable */ }
  }

  try {
    const raw = localStorage.getItem(TEACHER_SESSION_KEY)
    if (!raw) return null
    const legacySession = JSON.parse(raw) as TeacherSession
    storeTeacherSession(legacySession)
    return teacherSessionMemory
  } catch {
    clearTeacherSession()
    return null
  }
}

export async function logoutTeacher(): Promise<void> {
  const session = getTeacherSession()
  clearTeacherSession()
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
        storeTeacherSession({
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? session.refreshToken,
          email: data.user?.email ?? session.email,
        })
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
      clearTeacherSession()
      throw new Error('Сесія завершилася. Увійдіть знову.')
    }
    return send(freshToken)
  }
}

export function getTeacherMe(): Promise<{ id: string; authUserId: string; role: string; name: string; email: string }> {
  return authRequest('/api/teacher/me')
}

/** Explicit teacher sign-up request — the only way a pending teacher row appears. */
export function registerTeacherRequest(): Promise<{ status: string }> {
  return authRequest('/api/teacher/register-request', { method: 'POST', body: JSON.stringify({}) })
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
  kind: SchoolSessionKind
  activityKey: string | null
  activityLevel: string | null
}

export interface SchoolParticipantRow {
  id: string
  avatar: string
  nickname: string
  score: number
}

export interface SchoolTopicStat {
  topic: string | null
  total: number
  correct: number
}

/** Client-reported activity outcome, as the teacher dashboard receives it. */
export interface SchoolActivityResultRow {
  participantId: string
  correct: number
  total: number
  mistakes: number
  durationSec: number
  stars: number
  trust: string
  finishedAt: string | null
}

export function createSchoolSession(data: {
  grade: number
  difficulty?: string
  questionsCount?: number
  track?: string
  topic?: string
  schoolTopicId?: string
  kind?: SchoolSessionKind
  activityKey?: string
  activityLevel?: string
}): Promise<{ session: SchoolSessionInfo }> {
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

export function getSchoolSession(id: string): Promise<{
  session: SchoolSessionInfo
  participants: SchoolParticipantRow[]
  topicStats: SchoolTopicStat[]
  activityResults: SchoolActivityResultRow[]
}> {
  return authRequest(`/api/school/sessions/${encodeURIComponent(id)}`)
}

// Per-question breakdown for one participant. The server resolves the child's
// answer into display text and never returns answer keys or explanations.
export interface SchoolParticipantAnswer {
  position: number
  q: string
  topic: string | null
  answered: boolean
  isCorrect: boolean | null
  answerText: string | null
}

export function getSchoolParticipantAnswers(sessionId: string, participantId: string): Promise<{
  participant: SchoolParticipantRow
  answers: SchoolParticipantAnswer[]
}> {
  return authRequest(`/api/school/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}/answers`)
}

// Teacher-only look at the questions a session will actually play, with the
// answer resolved to text by the server (see docs/security-model.md).
export interface SchoolPreviewQuestion {
  id: string
  position: number
  q: string
  code: string | null
  type: string | null
  topic: string | null
  difficulty: string | null
  /** Render data without the nested answer keys (same shape as `Question.options`). */
  options: string[] | Record<string, unknown>
  /** Index of the key option for choice/truefalse/sequence; null for the rest. */
  correctOption: number | null
  answerText: string | null
  explanation: string | null
  img: string | null
  imageAlt: string | null
}

export function getSchoolSessionPreview(id: string): Promise<{ questions: SchoolPreviewQuestion[] }> {
  return authRequest(`/api/school/sessions/${encodeURIComponent(id)}/preview`)
}

export async function getSchoolSessionQuestions(id: string): Promise<{ questions: Question[] }> {
  const data = await authRequest(`/api/school/sessions/${encodeURIComponent(id)}/questions`)
  data.questions = (data.questions ?? []).map(normalizeQuestion)
  return data
}

export function submitSchoolProjectorAnswer(
  sessionId: string,
  questionId: string,
  answer: number | string | number[],
): Promise<{ correct: boolean }> {
  return authRequest(`/api/school/sessions/${encodeURIComponent(sessionId)}/projector-answer`, {
    method: 'POST',
    body: JSON.stringify({ questionId, answer }),
  })
}

// ─── Admin API ─────────────────────────────────────────────────────────────

/** Admin lists answer with one page. `total` describes the whole filtered set,
 *  so a pager can be drawn without a second request. */
export interface PageInfo {
  total: number
  limit: number
  offset: number
}

export interface PageParams {
  limit?: number
  offset?: number
}

/** Mirrors MAX_PAGE_SIZE on the server: a bigger page is rejected by schema. */
export const MAX_PAGE_SIZE = 200

const MAX_PAGES_PER_SWEEP = 40

function pageQuery(params: PageParams): URLSearchParams {
  const p = new URLSearchParams()
  if (params.limit  != null) p.set('limit',  String(params.limit))
  if (params.offset != null) p.set('offset', String(params.offset))
  return p
}

/** The static site and the API deploy separately, so a browser can briefly talk
 *  to a backend that still answers without `page`. Treat that as a single page
 *  over whatever came back rather than breaking the list. */
function pageOrFallback(page: PageInfo | undefined, items: unknown[], range: PageParams): PageInfo {
  if (page && typeof page.total === 'number') return page
  return {
    total:  items.length,
    limit:  range.limit ?? Math.max(items.length, 1),
    offset: range.offset ?? 0,
  }
}

/** Walks every page of a list endpoint. Only for the few callers that need the
 *  whole set — question pickers and CSV export — where a truncated list would
 *  be a silent bug rather than a shorter screen. */
export async function fetchAllPages<T>(
  load: (range: Required<PageParams>) => Promise<{ items: T[]; page: PageInfo }>,
): Promise<T[]> {
  const all: T[] = []
  for (let sweep = 0; sweep < MAX_PAGES_PER_SWEEP; sweep++) {
    const { items, page } = await load({ limit: MAX_PAGE_SIZE, offset: all.length })
    all.push(...items)
    if (!items.length || all.length >= page.total) break
  }
  return all
}

export function getAdminStats(): Promise<{ teachers: number; parents?: number; codes: number; results: number; events?: number }> {
  return authRequest('/api/admin/stats')
}

export interface AdminFunnelStep {
  step: HomeFunnelStep
  count: number
  conversionFromPrev: number | null
}

export interface AdminHomeFunnel {
  days: number
  steps: AdminFunnelStep[]
  byGrade: Array<{ grade: number; steps: AdminFunnelStep[] }>
}

export function getAdminHomeFunnel(days = 30): Promise<AdminHomeFunnel> {
  return authRequest(`/api/admin/home-funnel?days=${days}`)
}

export interface AdminParentSummary {
  email: string
  status: string
  emailVerified: boolean
  profileCount: number
  createdAt: string | null
}

export async function getAdminParents(page: PageParams = {}): Promise<{ parents: AdminParentSummary[]; page: PageInfo }> {
  const res = await authRequest(`/api/admin/parents?${pageQuery(page)}`)
  return { parents: res.parents, page: pageOrFallback(res.page, res.parents, page) }
}

export interface AdminTeacher {
  id: string
  email: string
  name: string | null
  status: string
  createdAt: string
}

export async function getAdminTeachers(page: PageParams = {}): Promise<{ teachers: AdminTeacher[]; page: PageInfo }> {
  const res = await authRequest(`/api/admin/teachers?${pageQuery(page)}`)
  return { teachers: res.teachers, page: pageOrFallback(res.page, res.teachers, page) }
}

export function setTeacherStatus(id: string, status: 'active' | 'blocked'): Promise<{ id: string; status: string }> {
  return authRequest(`/api/admin/teachers/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export async function getAdminResults(page: PageParams = {}): Promise<{ results: Attempt[]; page: PageInfo }> {
  const res = await authRequest(`/api/admin/results?${pageQuery(page)}`)
  return { results: res.results, page: pageOrFallback(res.page, res.results, page) }
}

export async function getAdminEvents(page: PageParams = {}): Promise<{ events: OlympiadEvent[]; page: PageInfo }> {
  const res = await authRequest(`/api/admin/events?${pageQuery(page)}`)
  return { events: res.events, page: pageOrFallback(res.page, res.events, page) }
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

export function updateQuestion(id: string, data: Partial<Omit<Question, 'id' | 'a'>> & { expectedEditVersion: number }): Promise<{ id: string; version: number; editVersion: number }> {
  return authRequest(`/api/admin/questions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function setQuestionEditorialStatus(
  id: string,
  status: NonNullable<Question['editorialStatus']>,
  expectedEditVersion: number,
): Promise<{ question: Question }> {
  return authRequest(`/api/admin/questions/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, expectedEditVersion }),
  })
}

export interface QuestionRevision {
  id: string
  questionId: string
  editVersion: number
  action: 'create' | 'update' | 'status' | 'restore' | 'backfill' | 'channels'
  snapshot: Record<string, unknown>
  changedBy: string | null
  createdAt: string
}

export function getQuestionRevisions(id: string): Promise<{ revisions: QuestionRevision[] }> {
  return authRequest(`/api/admin/questions/${id}/revisions`)
}

export function restoreQuestionRevision(
  id: string,
  revisionEditVersion: number,
  expectedEditVersion: number,
): Promise<{ question: Question }> {
  return authRequest(`/api/admin/questions/${id}/restore`, {
    method: 'POST',
    body: JSON.stringify({ revisionEditVersion, expectedEditVersion }),
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
  editVersion: number
  status: 'draft' | 'review' | 'published' | 'archived'
  publishedVersion: number | null
  config: Record<string, unknown> | null
  createdAt: string | null
  updatedAt: string | null
}

export function getAdminMissions(): Promise<{ missions: Mission[] }> {
  return authRequest('/api/admin/missions')
}

export type MissionSetPurpose = 'practice' | 'apply' | 'confirm'
export type MissionSetVariant = 'default' | 'a' | 'b'
export interface AdminMissionQuestionSet {
  id: string
  purpose: MissionSetPurpose
  variant: MissionSetVariant
  questionIds: string[]
}
export interface AdminQuestionSetMissionInput {
  id: string
  title: string
  kind: 'question-set'
  track: QuestionTrack
  grade: number
  config: {
    topic?: string
    difficulty?: 'easy' | 'medium' | 'hard'
    questionSets: AdminMissionQuestionSet[]
  }
}

export interface AdminSortingBin { id: string; label: string }
export interface AdminSortingItem { emoji: string; label?: string; bin: string }
export interface AdminSortingLevel {
  instruction: string
  bins: AdminSortingBin[]
  items: AdminSortingItem[]
}
export interface AdminSortingMissionInput {
  id: string
  title: string
  kind: 'sorting-game'
  track: QuestionTrack
  grade: number
  config: {
    gameKey: string
    topic?: string
    conceptKey?: string
    levels: AdminSortingLevel[]
  }
}
export interface AdminSequenceSet { id: string; title: string; steps: string[] }
export interface AdminSequenceMissionInput {
  id: string; title: string; kind: 'sequence-game'; track: QuestionTrack; grade: number
  config: { gameKey: string; topic?: string; sets: AdminSequenceSet[] }
}
export interface AdminScenarioOption { label: string; correct: boolean; feedback: string }
export interface AdminScenarioItem { id: string; emoji: string; text: string; options: AdminScenarioOption[] }
export interface AdminScenarioMissionInput {
  id: string; title: string; kind: 'scenario-game'; track: QuestionTrack; grade: number
  config: { gameKey: string; topic?: string; items: AdminScenarioItem[] }
}
export interface AdminFactOpinionStatement {
  id: string
  category: 'fact' | 'opinion' | 'myth'
  text: string
  explanation: string
  sourceTitle?: string
  sourceUrl?: string
  sourceLanguage?: 'uk' | 'en'
}
export interface AdminFactOpinionMissionInput {
  id: string; title: string; kind: 'fact-opinion-game'; track: QuestionTrack; grade: number
  config: { gameKey: string; topic?: string; statements: AdminFactOpinionStatement[] }
}
export interface AdminClickTrainerOption { label: string; emoji: string; correct: boolean; feedback: string }
export interface AdminClickTrainerRound {
  lead: string
  target: { label: string; emoji: string }
  options: AdminClickTrainerOption[]
}
export interface AdminClickTrainerMissionInput {
  id: string; title: string; kind: 'click-trainer-game'; track: QuestionTrack; grade: number
  config: { gameKey: string; topic?: string; rounds: AdminClickTrainerRound[] }
}
export interface AdminSimulatorTextVariant { source: string; value: string }
export interface AdminSimulatorTransition {
  slot: string
  labels: AdminSimulatorTextVariant[]
  target?: string
}
export interface AdminSimulatorNode {
  id: string
  icon: string
  texts: AdminSimulatorTextVariant[]
  info?: string
  transitions: AdminSimulatorTransition[]
}
export interface AdminSimulatorMissionInput {
  id: string; title: string; kind: 'simulator-game'; track: QuestionTrack; grade: number
  config: { scenarioKey: string; mechanicsVersion: number; topic?: string; nodes: AdminSimulatorNode[] }
}
export type AdminEditableMissionInput = AdminQuestionSetMissionInput | AdminSortingMissionInput
  | AdminSequenceMissionInput | AdminScenarioMissionInput | AdminFactOpinionMissionInput
  | AdminClickTrainerMissionInput | AdminSimulatorMissionInput

export function createAdminMission(data: AdminEditableMissionInput): Promise<{ mission: Mission }> {
  return authRequest('/api/admin/missions', { method: 'POST', body: JSON.stringify(data) })
}

export function updateAdminMission(id: string, data: AdminEditableMissionInput & { expectedEditVersion: number }): Promise<{ mission: Mission }> {
  return authRequest(`/api/admin/missions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function setAdminMissionStatus(id: string, status: Mission['status'], expectedEditVersion: number): Promise<{ mission: Mission }> {
  return authRequest(`/api/admin/missions/${encodeURIComponent(id)}/status`, {
    method: 'PUT', body: JSON.stringify({ status, expectedEditVersion }),
  })
}

export interface AdminMissionRevision {
  id: string
  missionId: string
  editVersion: number
  action: string
  snapshot: Record<string, unknown>
  changedBy: string | null
  createdAt: string
}

export function getAdminMissionRevisions(id: string): Promise<{ revisions: AdminMissionRevision[] }> {
  return authRequest(`/api/admin/missions/${encodeURIComponent(id)}/revisions`)
}

export function restoreAdminMissionRevision(id: string, revisionEditVersion: number, expectedEditVersion: number): Promise<{ mission: Mission }> {
  return authRequest(`/api/admin/missions/${encodeURIComponent(id)}/restore`, {
    method: 'POST', body: JSON.stringify({ revisionEditVersion, expectedEditVersion }),
  })
}

// ── Мікро-уроки (адмінка). Дітям контент їде статичним бандлом
// public/lessons/ (npm run export:lessons), не цим API. ──────────────────────

export interface AdminLessonCard {
  title?: string
  text: string
  image?: string
  imageAlt?: string
}

export interface AdminLessonCheckQuestion {
  question: string
  options: string[]
  correct: number
  explanation?: string
}

export interface AdminMicroLesson {
  id: string
  title: string
  version: number
  status: 'draft' | 'review' | 'published' | 'archived'
  editVersion: number
  publishedVersion: number | null
  cards: AdminLessonCard[]
  videoUrl: string | null
  checkQuestions: AdminLessonCheckQuestion[]
  createdAt: string | null
  updatedAt: string | null
}

export interface AdminLessonContent {
  title: string
  cards: AdminLessonCard[]
  videoUrl?: string | null
  checkQuestions: AdminLessonCheckQuestion[]
}

export function getAdminLessons(): Promise<{ lessons: AdminMicroLesson[] }> {
  return authRequest('/api/admin/lessons')
}

export function createAdminLesson(data: AdminLessonContent & { id: string }): Promise<{ lesson: AdminMicroLesson }> {
  return authRequest('/api/admin/lessons', { method: 'POST', body: JSON.stringify(data) })
}

export function updateAdminLesson(id: string, data: AdminLessonContent & { expectedEditVersion: number }): Promise<{ lesson: AdminMicroLesson; versionBumped: boolean }> {
  return authRequest(`/api/admin/lessons/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function setAdminLessonStatus(id: string, status: AdminMicroLesson['status'], expectedEditVersion: number): Promise<{ lesson: AdminMicroLesson }> {
  return authRequest(`/api/admin/lessons/${encodeURIComponent(id)}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, expectedEditVersion }),
  })
}

export interface AdminLessonRevision {
  id: string
  lessonId: string
  editVersion: number
  action: string
  snapshot: Record<string, unknown>
  changedBy: string | null
  createdAt: string
}

export function getAdminLessonRevisions(id: string): Promise<{ revisions: AdminLessonRevision[] }> {
  return authRequest(`/api/admin/lessons/${encodeURIComponent(id)}/revisions`)
}

export function restoreAdminLessonRevision(id: string, revisionEditVersion: number, expectedEditVersion: number): Promise<{ lesson: AdminMicroLesson }> {
  return authRequest(`/api/admin/lessons/${encodeURIComponent(id)}/restore`, {
    method: 'POST', body: JSON.stringify({ revisionEditVersion, expectedEditVersion }),
  })
}

export interface AdminContentPublication {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  expectedManifest: {
    schemaVersion: number
    practiceQuestions?: unknown[]
    lessons?: unknown[]
    gamePacks?: unknown[]
    paths?: unknown[]
  }
  expectedManifestSha256: string
  publishedManifestSha256: string | null
  requestedBy: string
  workflowRunId: string | null
  workflowUrl: string | null
  sourceSha: string | null
  failureReason: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface AdminContentDeliveryState {
  currentManifestSha256: string
  deployedManifestSha256: string | null
  pendingChanges: boolean
  activePublicationId: string | null
  activePublicationStatus: 'queued' | 'running' | null
  activeMatchesCurrent: boolean
}

export function getAdminContentPublications(): Promise<{
  publications: AdminContentPublication[]
  deliveryState: AdminContentDeliveryState
}> {
  return authRequest('/api/admin/content-publications')
}

export function createAdminContentPublication(): Promise<{ publication: AdminContentPublication }> {
  return authRequest('/api/admin/content-publications', { method: 'POST', body: JSON.stringify({}) })
}

// Admin-authored path maps (0033/0034). Children receive immutable revisions via
// public/path bundles, with the built-in map as a fail-safe fallback.

export interface AdminPathMap {
  pathId: string
  grade: number
  title: string
  version: number
  status: 'draft' | 'published'
  /** PathPoint[] у форматі features/path/path-data.ts (+ access). */
  points: unknown[]
  createdAt: string | null
  updatedAt: string | null
}

export function getAdminPathMaps(): Promise<{ maps: AdminPathMap[] }> {
  return authRequest('/api/admin/path-maps')
}

export function updateAdminPathMap(
  pathId: string,
  data: { expectedVersion: number; title?: string; points: unknown[] },
): Promise<{ map: AdminPathMap; bumpedSteps: string[] }> {
  return authRequest(`/api/admin/path-maps/${encodeURIComponent(pathId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// Filters shared by the bank list and its section counters. The section itself
// (isOlympiad / channel / unassigned) narrows the list only.
export interface AdminQuestionFilters {
  grade?: number | string
  type?: QuestionType | string
  difficulty?: string
  track?: QuestionTrack | string
  topic?: string
  status?: string
  search?: string
}

function adminQuestionQuery(params: AdminQuestionFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (params.grade != null) p.set('grade',      String(params.grade))
  if (params.type)          p.set('type',       String(params.type))
  if (params.difficulty)    p.set('difficulty', params.difficulty)
  if (params.track)         p.set('track',      String(params.track))
  if (params.topic)         p.set('topic',      params.topic)
  if (params.status)        p.set('status',     params.status)
  if (params.search)        p.set('search',     params.search)
  return p
}

export type AdminQuestionSection = 'class_game' | 'path' | 'olympiad_training' | 'main_round' | 'unassigned'
export type AdminQuestionCounts = Record<AdminQuestionSection | 'all', number>

export type AdminQuestionQuery = AdminQuestionFilters & PageParams & {
  isOlympiad?: boolean | string
  channel?: QuestionChannel | string
  unassigned?: boolean
}

export async function getAdminQuestions(params: AdminQuestionQuery = {}): Promise<{ questions: Question[]; page: PageInfo }> {
  const p = adminQuestionQuery(params)
  if (params.isOlympiad != null) p.set('isOlympiad', String(params.isOlympiad))
  if (params.channel)            p.set('channel',    String(params.channel))
  if (params.unassigned)         p.set('unassigned', 'true')
  if (params.limit  != null)     p.set('limit',      String(params.limit))
  if (params.offset != null)     p.set('offset',     String(params.offset))
  const res = await authRequest(`/api/admin/questions?${p}`)
  return { questions: res.questions, page: pageOrFallback(res.page, res.questions, params) }
}

/** Every question matching the filters, walked page by page. Question pickers
 *  need the full set — a page-sized picker would hide valid choices. */
export function getAllAdminQuestions(params: Omit<AdminQuestionQuery, keyof PageParams> = {}): Promise<Question[]> {
  return fetchAllPages(async range => {
    const { questions, page } = await getAdminQuestions({ ...params, ...range })
    return { items: questions, page }
  })
}

export function getAdminQuestionCounts(params: AdminQuestionFilters = {}): Promise<{ counts: AdminQuestionCounts }> {
  return authRequest(`/api/admin/questions/counts?${adminQuestionQuery(params)}`)
}

// Coverage of one section by grade and topic. Grade and topic are the axes, so
// the server refuses them as filters — they would hide the empty cells.
export interface AdminQuestionMatrixCell {
  grade: number | null
  topic: string | null
  total: number
}

export function getAdminQuestionMatrix(params: Omit<AdminQuestionFilters, 'grade' | 'topic'> & { isOlympiad?: boolean | string; channel?: QuestionChannel | string; unassigned?: boolean } = {}): Promise<{ cells: AdminQuestionMatrixCell[] }> {
  const p = adminQuestionQuery(params)
  if (params.isOlympiad != null) p.set('isOlympiad', String(params.isOlympiad))
  if (params.channel)            p.set('channel',    String(params.channel))
  if (params.unassigned)         p.set('unassigned', 'true')
  return authRequest(`/api/admin/questions/matrix?${p}`)
}

export interface AdminDemoCoverageCell {
  track: QuestionTrack
  difficulty: 'easy' | 'medium' | 'hard'
  requiredSlots: number
  candidates: number
  targetCandidates: number
  missingCandidates: number
  mechanics: QuestionType[]
  topics: number
  images: number
}

export interface AdminDemoCoverageGrade {
  grade: number
  ready: boolean
  canCompose: boolean
  cells: AdminDemoCoverageCell[]
  sample: {
    mechanics: QuestionType[]
    images: number
    maxTopicRepeats: number
    progression: Record<'recognize' | 'apply' | 'reason' | 'unassigned', number>
  } | null
  issues: Array<{
    code: 'cannot-compose' | 'variant-gap' | 'mechanic-gap' | 'image-gap' | 'topic-duplication'
    message: string
  }>
}

export function getAdminDemoCoverage(): Promise<{ grades: AdminDemoCoverageGrade[] }> {
  return authRequest('/api/admin/questions/demo-coverage')
}

export interface BulkQuestionResult {
  updated: number
  unchanged: number
  skipped: { id: string; reason: string }[]
}

/** One editorial transition across a selection. Blocked rows come back in
 *  `skipped` with a reason instead of failing the whole batch. */
export function setQuestionEditorialStatusBulk(
  ids: string[],
  status: NonNullable<Question['editorialStatus']>,
): Promise<BulkQuestionResult> {
  return authRequest('/api/admin/questions/status', {
    method: 'POST',
    body: JSON.stringify({ ids, status }),
  })
}

/** Bulk delete, drafts only — same rules as the single-question route. */
export function deleteQuestionsBulk(ids: string[]): Promise<{
  deleted: number
  skipped: { id: string; reason: string }[]
}> {
  return authRequest('/api/admin/questions/delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

// Delivery-only bulk edit: adds or removes one channel across a selection.
export function updateQuestionChannels(ids: string[], channel: QuestionChannel, action: 'add' | 'remove'): Promise<{
  updated: number
  unchanged: number
  skipped: { id: string; reason: string }[]
}> {
  return authRequest('/api/admin/questions/channels', {
    method: 'POST',
    body: JSON.stringify({ ids, channel, action }),
  })
}
