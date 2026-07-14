import { pgTable, text, integer, boolean, timestamp, jsonb, uuid, unique } from 'drizzle-orm/pg-core'

/**
 * Типи питань:
 *   choice     — вибір одного з варіантів (options: string[], correct: number — індекс)
 *   truefalse  — Так/Ні (options: ['Так','Ні'], correct: 0|1)
 *   input      — текстова/числова відповідь (options: {answer,inputType?}, correct: null)
 *   sort       — розставити кроки по порядку (options: {items,correctOrder}, correct: null)
 *   sequence   — аналог sort, інший UX
 *   match      — зіставлення пар (options: {left,right,pairs}, correct: null)
 */
export type QuestionType = 'choice' | 'truefalse' | 'input' | 'sort' | 'sequence' | 'match'
export type QuestionTrack = 'informatics' | 'computational-thinking' | 'ai-basics'

export const questions = pgTable('questions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  q:           text('q').notNull(),
  code:        text('code'),
  type:        text('type').notNull().default('choice').$type<QuestionType>(),
  options:     jsonb('options').notNull().$type<string[] | Record<string, unknown>>(),
  correct:     integer('correct'),   // null для input/sort/sequence/match
  explanation: text('explanation'),
  difficulty:  text('difficulty'),
  track:       text('track').$type<QuestionTrack>(),
  // Таксономія вмісту (docs/content-taxonomy.md):
  //   topic — предметна тема в межах track; conceptKey — CT-навичка (крос-напрямкова)
  topic:       text('topic'),
  conceptKey:  text('concept_key'),
  progressionBand: text('progression_band').$type<'recognize' | 'apply' | 'reason'>(),
  // Інкрементується бекендом при змістовних правках (q/options/correct/type)
  version:     integer('version').notNull().default(1),
  // Редакційні метадані без окремих колонок (reviewStatus, isCore, джерело імпорту…)
  meta:        jsonb('meta').$type<Record<string, unknown>>(),
  grade:       integer('grade'),
  isOlympiad:  boolean('is_olympiad').default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type Question = typeof questions.$inferSelect
export type NewQuestion = typeof questions.$inferInsert

export const olympiadEvents = pgTable('olympiad_events', {
  id:          uuid('id').primaryKey().defaultRandom(),
  title:       text('title').notNull(),
  description: text('description'),
  startsAt:    timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt:      timestamp('ends_at', { withTimezone: true }).notNull(),
  timeMinutes: integer('time_minutes').notNull().default(15),
  questionsCount: integer('questions_count').notNull().default(10),
  status:      text('status').notNull().default('draft'), // draft | published | active | finished | archived
  createdBy:   text('created_by').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type OlympiadEvent = typeof olympiadEvents.$inferSelect
export type NewOlympiadEvent = typeof olympiadEvents.$inferInsert

export const eventQuestions = pgTable('event_questions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  eventId:    uuid('event_id').notNull().references(() => olympiadEvents.id),
  questionId: uuid('question_id').notNull().references(() => questions.id),
  grade:      integer('grade').notNull(),
  position:   integer('position').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export type EventQuestion = typeof eventQuestions.$inferSelect
export type NewEventQuestion = typeof eventQuestions.$inferInsert

export const accessCodes = pgTable('access_codes', {
  id:         uuid('id').primaryKey().defaultRandom(),
  eventId:    uuid('event_id').references(() => olympiadEvents.id),
  registrationId: uuid('registration_id').references(() => eventRegistrations.id),
  code:       text('code').notNull().unique(),
  grade:      integer('grade').notNull(),
  maxUses:    integer('max_uses').notNull().default(1),
  usedCount:  integer('used_count').notNull().default(0),
  expiresAt:  timestamp('expires_at', { withTimezone: true }),
  createdBy:  text('created_by').notNull(),   // auth user id вчителя
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export type AccessCode = typeof accessCodes.$inferSelect

export const attempts = pgTable('attempts', {
  id:          uuid('id').primaryKey().defaultRandom(),
  codeId:      uuid('code_id').notNull().references(() => accessCodes.id),
  grade:       integer('grade').notNull(),
  status:      text('status').notNull().default('in_progress'), // in_progress | finished | expired
  answers:     jsonb('answers').default({}).$type<Record<string, number | string | number[]>>(),
  score:       integer('score'),
  totalQ:      integer('total_q'),
  startedAt:   timestamp('started_at', { withTimezone: true }).defaultNow(),
  finishedAt:  timestamp('finished_at', { withTimezone: true }),
  // Пауза таймера для блекаутів: накопичена «прощена» пауза (сек) і час
  // останнього heartbeat. Сервер міряє розрив між heartbeat-ами.
  pausedSeconds: integer('paused_seconds').notNull().default(0),
  lastSeenAt:    timestamp('last_seen_at', { withTimezone: true }),
})

export type Attempt = typeof attempts.$inferSelect

export const attemptQuestions = pgTable('attempt_questions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  attemptId:  uuid('attempt_id').notNull().references(() => attempts.id),
  questionId: uuid('question_id').notNull().references(() => questions.id),
  position:   integer('position').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export type AttemptQuestion = typeof attemptQuestions.$inferSelect
export type NewAttemptQuestion = typeof attemptQuestions.$inferInsert

export const appUsers = pgTable('app_users', {
  id:         uuid('id').primaryKey().defaultRandom(),
  authUserId: text('auth_user_id').notNull().unique(), // Supabase auth.users id
  email:      text('email').notNull(),
  name:       text('name'),
  role:       text('role').notNull().default('teacher'), // teacher | admin
  // pending | active | blocked. Дефолт 'pending' (safe-by-default): будь-який
  // insert без явного статусу НЕ дає активного користувача. Auto-provision у
  // lib/auth.ts все одно ставить 'pending' явно; адмін активує вручну.
  status:     text('status').notNull().default('pending'),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export type AppUser = typeof appUsers.$inferSelect

export const teacherClasses = pgTable('teacher_classes', {
  id:        uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').notNull().references(() => appUsers.id),
  name:      text('name').notNull(),
  grade:     integer('grade').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type TeacherClass = typeof teacherClasses.$inferSelect
export type NewTeacherClass = typeof teacherClasses.$inferInsert

export const eventRegistrations = pgTable('event_registrations', {
  id:                uuid('id').primaryKey().defaultRandom(),
  eventId:           uuid('event_id').notNull().references(() => olympiadEvents.id),
  classId:           uuid('class_id').notNull().references(() => teacherClasses.id),
  teacherId:         uuid('teacher_id').notNull().references(() => appUsers.id),
  grade:             integer('grade').notNull(),
  participantsCount: integer('participants_count').notNull(),
  paymentStatus:     text('payment_status').notNull().default('not_required'), // not_required | pending | paid | failed | refunded
  status:            text('status').notNull().default('registered'), // registered | cancelled
  createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type EventRegistration = typeof eventRegistrations.$inferSelect
export type NewEventRegistration = typeof eventRegistrations.$inferInsert

export const classStudents = pgTable('class_students', {
  id:        uuid('id').primaryKey().defaultRandom(),
  classId:   uuid('class_id').notNull().references(() => teacherClasses.id, { onDelete: 'cascade' }),
  teacherId: uuid('teacher_id').notNull().references(() => appUsers.id),
  label:     text('label').notNull(), // довільна мітка вчителя: "Маша К.", "Учень 5", тощо
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type ClassStudent = typeof classStudents.$inferSelect
export type NewClassStudent = typeof classStudents.$inferInsert

// ── School Mode (просунутий режим, Kahoot-стиль) ──────────────────────────────
// Ефемерні класні сесії: вчитель створює, учні приєднуються анонімно за кодом.
// Жодних дитячих PII — nickname лише мітка, avatar із allowlist. Скоринг на сервері.

export const schoolSessions = pgTable('school_sessions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  teacherId:      uuid('teacher_id').notNull().references(() => appUsers.id),
  grade:          integer('grade').notNull(),
  difficulty:     text('difficulty'),                 // easy | medium | hard | null
  questionsCount: integer('questions_count').notNull().default(10),
  joinCode:       text('join_code').notNull().unique(),
  status:         text('status').notNull().default('lobby'), // lobby | active | finished
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow(),
  startedAt:      timestamp('started_at', { withTimezone: true }),
  finishedAt:     timestamp('finished_at', { withTimezone: true }),
})

export type SchoolSession = typeof schoolSessions.$inferSelect
export type NewSchoolSession = typeof schoolSessions.$inferInsert

// Immutable набір питань сесії (як attempt_questions).
export const schoolSessionQuestions = pgTable('school_session_questions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  sessionId:  uuid('session_id').notNull().references(() => schoolSessions.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id),
  position:   integer('position').notNull(),
})

export type SchoolSessionQuestion = typeof schoolSessionQuestions.$inferSelect

// Ефемерний учасник. participant_token (HMAC) видає сервер; тут не зберігається.
export const schoolParticipants = pgTable('school_participants', {
  id:        uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => schoolSessions.id, { onDelete: 'cascade' }),
  avatar:    text('avatar').notNull(),      // із allowlist SCHOOL_AVATARS
  nickname:  text('nickname').notNull(),    // довільна мітка, не справжнє імʼя
  score:     integer('score').notNull().default(0),
  joinedAt:  timestamp('joined_at', { withTimezone: true }).defaultNow(),
})

export type SchoolParticipant = typeof schoolParticipants.$inferSelect

// Відповіді учасника; is_correct рахує сервер. UNIQUE(participant, question) — без дублів.
export const schoolAnswers = pgTable('school_answers', {
  id:            uuid('id').primaryKey().defaultRandom(),
  participantId: uuid('participant_id').notNull().references(() => schoolParticipants.id, { onDelete: 'cascade' }),
  questionId:    uuid('question_id').notNull().references(() => questions.id),
  answer:        jsonb('answer'),
  isCorrect:     boolean('is_correct').notNull(),
  answeredAt:    timestamp('answered_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqParticipantQuestion: unique('school_answers_participant_question_uq').on(t.participantId, t.questionId),
}))

export type SchoolAnswer = typeof schoolAnswers.$inferSelect

// ── Missions registry ─────────────────────────────────────────────────────────
// Реєстр місій (question-set сьогодні, ігри/симуляції далі). Движок місії живе
// у коді фронтенду; БД знає id, призначення і версію. Свідомо БЕЗ FK від
// home_demo_attempts/home_mission_attempts: контракт Home фіксує missionId як
// логічний ідентифікатор (docs/home-demo-contract.md), реєстр — management-шар.

export const missions = pgTable('missions', {
  id:        text('id').primaryKey(),                 // slug: demo-informatics-grade2
  title:     text('title').notNull(),
  kind:      text('kind').notNull().default('question-set'), // question-set | sorting-game | …
  track:     text('track').notNull().$type<QuestionTrack>(),
  grade:     integer('grade').notNull(),
  version:   integer('version').notNull().default(1),
  status:    text('status').notNull().default('active'),     // draft | active | archived
  config:    jsonb('config').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type Mission = typeof missions.$inferSelect
export type NewMission = typeof missions.$inferInsert

// Мікро-уроки (0032): теорія перед випробуванням на карті шляху. Авторяться
// в адмінці, дітям роздаються статичним бандлом public/lessons/<id>.json
// (npm run export:lessons) — дитячі сторінки БД не читають. Ключі
// перевірочних питань формувальні й публічні свідомо (як practice-бандл).
export const microLessons = pgTable('micro_lessons', {
  id:             text('id').primaryKey(),   // slug: info-senses-g2
  title:          text('title').notNull(),
  version:        integer('version').notNull().default(1),
  status:         text('status').notNull().default('draft').$type<'draft' | 'published' | 'archived'>(),
  cards:          jsonb('cards').notNull().$type<unknown[]>(),
  videoUrl:       text('video_url'),
  checkQuestions: jsonb('check_questions').notNull().$type<unknown[]>(),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type MicroLessonRow = typeof microLessons.$inferSelect

// Структура навчального шляху (0033): джерело правди для валідації
// path-progress і для статичного експорту (npm run export:path). Дитячі
// сторінки читають бандл public/path/<pathId>.json, не БД. points —
// масив PathPoint (див. features/path/path-data.ts + поле access).
export const pathMaps = pgTable('path_maps', {
  pathId:    text('path_id').primaryKey(),   // 'grade-1'..'grade-4'
  grade:     integer('grade').notNull().unique(),
  title:     text('title').notNull(),
  version:   integer('version').notNull().default(1),
  status:    text('status').notNull().default('published').$type<'draft' | 'published'>(),
  points:    jsonb('points').notNull().$type<unknown[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type PathMapRow = typeof pathMaps.$inferSelect

// ── Home Mode (parent-led, consent-based) ─────────────────────────────────────
// Контракт: docs/home-demo-contract.md. Лід = батьківський email + згода.
// Дитячі дані пишуться ЛИШЕ після створення ліда (consent-gate на бекенді).
// Жодного звʼязку зі шкільними сесіями чи їх токенами.

// Батьківський акаунт (0029) — окрема ідентичність 1:1 із Supabase Auth
// користувачем. НЕ app_users: batьківська авторизація не має проходити через
// teacher/admin auto-provisioning (docs/security-model.md). Runtime routes are
// implemented under /api/parent; production requires migrations 0029–0031.
export const homeParentAccounts = pgTable('home_parent_accounts', {
  id:              uuid('id').primaryKey().defaultRandom(),
  authUserId:      uuid('auth_user_id').notNull().unique(),
  email:           text('email').notNull().unique(),   // нормалізований lowercase (застосунок)
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  status:          text('status').notNull().default('active'),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type HomeParentAccount = typeof homeParentAccounts.$inferSelect

export const homeLeads = pgTable('home_leads', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  parentEmail:          text('parent_email').notNull(),
  consentPolicyVersion: text('consent_policy_version').notNull(),
  // Клієнтський час згоди — інформаційний; довірений час — created_at сервера.
  consentAcceptedAt:    timestamp('consent_accepted_at', { withTimezone: true }).notNull(),
  createdAt:            timestamp('created_at', { withTimezone: true }).defaultNow(),
  // Nullable ownership (0029): заповнюється лише транзакційним claim
  // (parent auth + lead-token + збіг підтвердженого email). RESTRICT —
  // fail-closed до документованої політики видалення акаунтів.
  parentAccountId:      uuid('parent_account_id').references(() => homeParentAccounts.id, { onDelete: 'restrict' }),
  claimedAt:            timestamp('claimed_at', { withTimezone: true }),
})

export type HomeLead = typeof homeLeads.$inferSelect

export const homeChildProfiles = pgTable('home_child_profiles', {
  id:          uuid('id').primaryKey().defaultRandom(),
  // Nullable з 0030: профіль може бути створений батьківським акаунтом без
  // demo-ліда. Fail-closed CHECK у міграції: хоча б один власник
  // (lead_id АБО parent_account_id) завжди є.
  leadId:      uuid('lead_id').references(() => homeLeads.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),          // опційне, ніколи не вимагається
  grade:       integer('grade').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  // Nullable ownership (0029): backfill при claim або пряме створення батьком.
  parentAccountId: uuid('parent_account_id').references(() => homeParentAccounts.id, { onDelete: 'restrict' }),
})

export type HomeChildProfile = typeof homeChildProfiles.$inferSelect

// Home path progress (0031). Browser results are explicitly untrusted practice
// evidence; official reports and diplomas continue to use server-scored missions.
export const homePathProgress = pgTable('home_path_progress', {
  id:              uuid('id').primaryKey().defaultRandom(),
  childProfileId:  uuid('child_profile_id').notNull().references(() => homeChildProfiles.id, { onDelete: 'cascade' }),
  pathId:          text('path_id').notNull(),
  pointId:         text('point_id').notNull(),
  status:          text('status').notNull().default('completed').$type<'completed'>(),
  bestStars:       integer('best_stars').notNull(),
  attempts:        integer('attempts').notNull().default(1),
  lastCompletedAt: timestamp('last_completed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqProfilePathPoint: unique('home_path_progress_profile_path_point_uq')
    .on(t.childProfileId, t.pathId, t.pointId),
}))

export type HomePathProgress = typeof homePathProgress.$inferSelect

export const homePathEvents = pgTable('home_path_events', {
  id:                uuid('id').primaryKey().defaultRandom(),
  childProfileId:    uuid('child_profile_id').notNull().references(() => homeChildProfiles.id, { onDelete: 'cascade' }),
  eventKey:          text('event_key').notNull(),
  pathId:            text('path_id').notNull(),
  pointId:           text('point_id').notNull(),
  activityResults:   jsonb('activity_results').notNull(),
  trust:             text('trust').notNull().default('client-unverified').$type<'client-unverified'>(),
  clientCompletedAt: timestamp('client_completed_at', { withTimezone: true }).notNull(),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqProfileEvent: unique('home_path_events_profile_event_key_uq')
    .on(t.childProfileId, t.eventKey),
}))

export type HomePathEvent = typeof homePathEvents.$inferSelect

// Сирі події демо-спроби (телеметрія в jsonb). Скоринг — на сервері при прийомі.
export const homeDemoAttempts = pgTable('home_demo_attempts', {
  id:              uuid('id').primaryKey().defaultRandom(),
  childProfileId:  uuid('child_profile_id').notNull().references(() => homeChildProfiles.id, { onDelete: 'cascade' }),
  missionId:       text('mission_id').notNull(),
  missionVersion:  integer('mission_version').notNull(),
  track:           text('track').notNull(),   // informatics | computational-thinking | ai-basics
  grade:           integer('grade').notNull(),
  events:          jsonb('events').notNull(),
  clientStartedAt:  timestamp('client_started_at', { withTimezone: true }),
  clientFinishedAt: timestamp('client_finished_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  // Idempotent per lead+mission: одна демо-спроба на місію для профілю.
  uniqProfileMission: unique('home_demo_attempts_profile_mission_uq').on(t.childProfileId, t.missionId),
}))

export type HomeDemoAttempt = typeof homeDemoAttempts.$inferSelect

export const homeDemoReports = pgTable('home_demo_reports', {
  id:            uuid('id').primaryKey().defaultRandom(),
  attemptId:     uuid('attempt_id').notNull().references(() => homeDemoAttempts.id, { onDelete: 'cascade' }),
  report:        jsonb('report').notNull(),
  reportVersion: integer('report_version').notNull().default(1),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export type HomeDemoReport = typeof homeDemoReports.$inferSelect

// Платний доступ Home (Rozumko Club). Один entitlement на лід; статус вирішує
// доступ (active | past_due | canceled | expired | revoked), картки — у
// провайдера. Entitlement не впливає на скоринг (docs/security-model.md).
export const homeEntitlements = pgTable('home_entitlements', {
  id:               uuid('id').primaryKey().defaultRandom(),
  leadId:           uuid('lead_id').notNull().references(() => homeLeads.id, { onDelete: 'cascade' }).unique(),
  status:           text('status').notNull().$type<'active' | 'past_due' | 'canceled' | 'expired' | 'revoked'>(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  providerRef:      text('provider_ref'),   // ідентифікатор підписки у провайдера (пізніше)
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type HomeEntitlement = typeof homeEntitlements.$inferSelect

// Audit-журнал змін entitlement-у: хто, з якого статусу в який і чому.
export const homeEntitlementEvents = pgTable('home_entitlement_events', {
  id:            uuid('id').primaryKey().defaultRandom(),
  entitlementId: uuid('entitlement_id').notNull().references(() => homeEntitlements.id, { onDelete: 'cascade' }),
  actor:         text('actor').notNull(),        // admin | provider
  fromStatus:    text('from_status'),
  toStatus:      text('to_status').notNull(),
  reason:        text('reason'),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export type HomeEntitlementEvent = typeof homeEntitlementEvents.$inferSelect

// Ідемпотентний журнал верифікованих webhook-подій провайдера. Платіжний
// provider ще не обраний; контракт фіксує fail-closed межу до інтеграції.
export const homePaymentEvents = pgTable('home_payment_events', {
  id:              uuid('id').primaryKey().defaultRandom(),
  provider:        text('provider').notNull(),
  providerEventId: text('provider_event_id').notNull(),
  leadId:          uuid('lead_id').notNull().references(() => homeLeads.id, { onDelete: 'cascade' }),
  eventType:       text('event_type').notNull(),
  providerRef:     text('provider_ref'),
  payload:         jsonb('payload').notNull(),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqProviderEvent: unique('home_payment_events_provider_event_uq').on(t.provider, t.providerEventId),
}))

export type HomePaymentEvent = typeof homePaymentEvents.$inferSelect

// Club practice-місії (платний контент). На відміну від демо — повторювані:
// без UNIQUE на (profile, mission). Кожна спроба зберігає сирі події і
// серверний звіт. Доступ вирішує hasHomeAccess ДО запису (гейт у роуті).
export const homeMissionAttempts = pgTable('home_mission_attempts', {
  id:               uuid('id').primaryKey().defaultRandom(),
  childProfileId:   uuid('child_profile_id').notNull().references(() => homeChildProfiles.id, { onDelete: 'cascade' }),
  missionId:        text('mission_id').notNull(),
  missionVersion:   integer('mission_version').notNull(),
  track:            text('track').notNull(),
  grade:            integer('grade').notNull(),
  events:           jsonb('events').notNull(),
  report:           jsonb('report').notNull(),
  reportVersion:    integer('report_version').notNull().default(1),
  correct:          integer('correct').notNull(),
  total:            integer('total').notNull(),
  clientStartedAt:  timestamp('client_started_at', { withTimezone: true }),
  clientFinishedAt: timestamp('client_finished_at', { withTimezone: true }),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export type HomeMissionAttempt = typeof homeMissionAttempts.$inferSelect
