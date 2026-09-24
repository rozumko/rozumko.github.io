import { sql } from 'drizzle-orm'
import { pgTable, text, integer, smallint, date, boolean, timestamp, jsonb, uuid, unique, primaryKey, numeric } from 'drizzle-orm/pg-core'

/**
 * Типи питань:
 *   choice     — вибір одного з варіантів (options: string[], correct: number — індекс)
 *   truefalse  — Так/Ні (options: ['Так','Ні'], correct: 0|1)
 *   input      — текстова/числова відповідь (options: {answer,inputType?}, correct: null)
 *   sort       — розставити кроки по порядку (options: {items,correctOrder}, correct: null)
 *   sequence   — аналог sort, інший UX
 *   match      — зіставлення пар (options: {left,right,pairs}, correct: null)
 */
export type QuestionType = 'choice' | 'multi_select' | 'truefalse' | 'input' | 'sort' | 'sequence' | 'match'
export type QuestionTrack = 'informatics' | 'computational-thinking' | 'ai-basics'
export type QuestionChannel = 'class_game' | 'path' | 'olympiad_training'
export type QuestionEditorialStatus = 'draft' | 'review' | 'published' | 'archived'

export const questions = pgTable('questions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  q:           text('q').notNull(),
  code:        text('code'),
  type:        text('type').notNull().default('choice').$type<QuestionType>(),
  options:     jsonb('options').notNull().$type<string[] | Record<string, unknown>>(),
  correct:     integer('correct'),   // null для input/sort/sequence/match
  explanation: text('explanation'),
  img:         text('img'),
  imageAlt:    text('image_alt'),
  difficulty:  text('difficulty'),
  track:       text('track').$type<QuestionTrack>(),
  // Таксономія вмісту (docs/content-taxonomy.md):
  //   topic — предметна тема в межах track; conceptKey — CT-навичка (крос-напрямкова)
  topic:       text('topic'),
  conceptKey:  text('concept_key'),
  progressionBand: text('progression_band').$type<'recognize' | 'apply' | 'reason'>(),
  // Incremented by the backend for every child-visible or selection-affecting edit.
  version:     integer('version').notNull().default(1),
  // Окремий optimistic-lock лічильник кожного редакційного збереження.
  editVersion: integer('edit_version').notNull().default(1),
  editorialStatus: text('editorial_status').notNull().default('draft').$type<QuestionEditorialStatus>(),
  // Редакційні метадані без окремих колонок (reviewStatus, isCore, джерело імпорту…)
  meta:        jsonb('meta').$type<Record<string, unknown>>(),
  grade:       integer('grade'),
  isOlympiad:  boolean('is_olympiad').notNull().default(false),
  channels:    text('channels').array().notNull().default(sql`ARRAY[]::text[]`).$type<QuestionChannel[]>(),
  createdBy:   text('created_by'),
  updatedBy:   text('updated_by'),
  reviewedBy:  text('reviewed_by'),
  publishedBy: text('published_by'),
  reviewedAt:  timestamp('reviewed_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  // Private teacher-authored questions point to an owned topic. Public/admin
  // content keeps this null and continues through the editorial workflow.
  teacherTopicId: uuid('teacher_topic_id'),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type Question = typeof questions.$inferSelect
export type NewQuestion = typeof questions.$inferInsert

// Immutable editorial snapshots. editVersion is independent from the public
// content version, so metadata/status-only changes are also recoverable.
export const questionRevisions = pgTable('question_revisions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  questionId:  uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  editVersion: integer('edit_version').notNull(),
  action:      text('action').notNull(),
  snapshot:    jsonb('snapshot').notNull().$type<Record<string, unknown>>(),
  changedBy:   text('changed_by'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqQuestionEditVersion: unique('question_revisions_question_edit_version_uq').on(t.questionId, t.editVersion),
}))

export type QuestionRevisionRow = typeof questionRevisions.$inferSelect

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

export const teacherQuestionTopics = pgTable('teacher_question_topics', {
  id:          uuid('id').primaryKey().defaultRandom(),
  teacherId:   uuid('teacher_id').notNull().references(() => appUsers.id),
  title:       text('title').notNull(),
  description: text('description'),
  grade:       integer('grade').notNull(),
  archivedAt:  timestamp('archived_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type TeacherQuestionTopic = typeof teacherQuestionTopics.$inferSelect

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
  // Delivery kind of the session. 'questions' — server-graded quiz (default,
  // the historical behaviour); 'activity' — procedural game whose result the
  // browser reports (school-activities.ts).
  kind:           text('kind').notNull().default('questions'), // questions | activity
  activityKey:    text('activity_key'),               // set only when kind = 'activity'
  activityLevel:  text('activity_level'),
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
  // Immutable server-side copy used for delivery and scoring. Nullable only
  // for sessions created before migration 0048.
  snapshot:   jsonb('snapshot').$type<Record<string, unknown>>(),
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

// Фінальний результат активності. Джерело — браузер учня (гра процедурна, у
// неї немає ключа), тому trust завжди 'client-unverified'; сервер лише ріже
// значення по стелях реєстру. UNIQUE(participant) — один результат на учня.
export const schoolActivityResults = pgTable('school_activity_results', {
  id:            uuid('id').primaryKey().defaultRandom(),
  participantId: uuid('participant_id').notNull().references(() => schoolParticipants.id, { onDelete: 'cascade' }),
  activityKey:   text('activity_key').notNull(),
  activityLevel: text('activity_level').notNull(),
  correct:       integer('correct').notNull(),
  total:         integer('total').notNull(),
  mistakes:      integer('mistakes').notNull().default(0),
  durationSec:   integer('duration_sec').notNull(),
  stars:         integer('stars').notNull(),
  trust:         text('trust').notNull().default('client-unverified'),
  finishedAt:    timestamp('finished_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqParticipant: unique('school_activity_results_participant_uq').on(t.participantId),
}))

export type SchoolActivityResult = typeof schoolActivityResults.$inferSelect

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
  editVersion: integer('edit_version').notNull().default(1),
  status:    text('status').notNull().default('draft'),     // draft | review | published | archived
  config:    jsonb('config').$type<Record<string, unknown>>(),
  publishedVersion: integer('published_version'),
  publishedSnapshot: jsonb('published_snapshot').$type<Record<string, unknown>>(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  reviewedBy: text('reviewed_by'),
  publishedBy: text('published_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type Mission = typeof missions.$inferSelect
export type NewMission = typeof missions.$inferInsert

export const missionRevisions = pgTable('mission_revisions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  missionId:   text('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  editVersion: integer('edit_version').notNull(),
  action:      text('action').notNull(),
  snapshot:    jsonb('snapshot').notNull().$type<Record<string, unknown>>(),
  changedBy:   text('changed_by'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqMissionEditVersion: unique('mission_revisions_mission_edit_version_uq').on(t.missionId, t.editVersion),
}))

export type MissionRevisionRow = typeof missionRevisions.$inferSelect

// Audited requests to rebuild and deploy all static child-facing bundles.
// The expected manifest hash freezes the exact published versions requested by
// the admin; GitHub Actions refuses deployment if the database changes in queue.
export const contentPublications = pgTable('content_publications', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  status:             text('status').notNull().default('queued').$type<'queued' | 'running' | 'succeeded' | 'failed'>(),
  expectedManifest:   jsonb('expected_manifest').notNull().$type<Record<string, unknown>>(),
  expectedManifestSha256: text('expected_manifest_sha256').notNull(),
  publishedManifestSha256: text('published_manifest_sha256'),
  requestedBy:        text('requested_by').notNull(),
  workflowRunId:      text('workflow_run_id'),
  workflowUrl:        text('workflow_url'),
  sourceSha:          text('source_sha'),
  failureReason:      text('failure_reason'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt:          timestamp('started_at', { withTimezone: true }),
  completedAt:        timestamp('completed_at', { withTimezone: true }),
})

export type ContentPublicationRow = typeof contentPublications.$inferSelect

// Мікро-уроки (0032): теорія перед випробуванням на карті шляху. Авторяться
// в адмінці, дітям роздаються статичним бандлом public/lessons/<id>.json
// (npm run export:lessons) — дитячі сторінки БД не читають. Ключі
// перевірочних питань формувальні й публічні свідомо (як practice-бандл).
export const microLessons = pgTable('micro_lessons', {
  id:             text('id').primaryKey(),   // slug: info-senses-g2
  title:          text('title').notNull(),
  version:        integer('version').notNull().default(1),
  status:         text('status').notNull().default('draft').$type<'draft' | 'review' | 'published' | 'archived'>(),
  editVersion:    integer('edit_version').notNull().default(1),
  publishedVersion: integer('published_version'),
  publishedSnapshot: jsonb('published_snapshot').$type<Record<string, unknown>>(),
  cards:          jsonb('cards').notNull().$type<unknown[]>(),
  videoUrl:       text('video_url'),
  checkQuestions: jsonb('check_questions').notNull().$type<unknown[]>(),
  createdBy:      text('created_by'),
  updatedBy:      text('updated_by'),
  reviewedBy:     text('reviewed_by'),
  publishedBy:    text('published_by'),
  reviewedAt:     timestamp('reviewed_at', { withTimezone: true }),
  publishedAt:    timestamp('published_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type MicroLessonRow = typeof microLessons.$inferSelect

export const microLessonRevisions = pgTable('micro_lesson_revisions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  lessonId:    text('lesson_id').notNull().references(() => microLessons.id, { onDelete: 'cascade' }),
  editVersion: integer('edit_version').notNull(),
  action:      text('action').notNull(),
  snapshot:    jsonb('snapshot').notNull().$type<Record<string, unknown>>(),
  changedBy:   text('changed_by'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqLessonEditVersion: unique('micro_lesson_revisions_lesson_edit_version_uq').on(t.lessonId, t.editVersion),
}))

export type MicroLessonRevisionRow = typeof microLessonRevisions.$inferSelect

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

// Append-only snapshots of every published path-map version (0034). Old and
// offline clients submit the version embedded in their static bundle, so the
// backend can validate practice progress against the exact graph they used.
export const pathMapRevisions = pgTable('path_map_revisions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  pathId:    text('path_id').notNull().references(() => pathMaps.pathId, { onDelete: 'cascade' }),
  version:   integer('version').notNull(),
  grade:     integer('grade').notNull(),
  title:     text('title').notNull(),
  points:    jsonb('points').notNull().$type<unknown[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqPathVersion: unique('path_map_revisions_path_version_uq').on(t.pathId, t.version),
}))

export type PathMapRevisionRow = typeof pathMapRevisions.$inferSelect

// ── Home Mode (parent-led, consent-based) ─────────────────────────────────────
// Контракт: docs/home-demo-contract.md. Лід = батьківський email + згода.
// Дитячі дані пишуться ЛИШЕ після створення ліда (consent-gate на бекенді).
// Жодного звʼязку зі шкільними сесіями чи їх токенами.

// Parent account (0029) is a separate 1:1 Supabase Auth identity. It never
// uses teacher/admin app_users authorization (docs/security-model.md). Runtime
// routes live under /api/parent; production requires migrations 0029–0031.
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
  pathVersion:       integer('path_version').notNull().default(1),
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

// Знеособлені лічильники воронки Home Mode. Один рядок = (дата, крок, клас,
// напрям) → лічильник. Ані відвідувача, ані сесії, ані IP тут немає і не може
// зʼявитися: до згоди батька нічого індивідуального не зберігається
// (docs/security-model.md). Деталі й наслідки — routes/home-funnel.ts.
export const homeFunnelCounters = pgTable('home_funnel_counters', {
  bucketDate: date('bucket_date').notNull().default(sql`CURRENT_DATE`),
  step:       text('step').notNull(),
  grade:      smallint('grade').notNull().default(0),
  track:      text('track').notNull().default('none'),
  count:      integer('count').notNull().default(0),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.bucketDate, t.step, t.grade, t.track] }),
}))

export type HomeFunnelCounter = typeof homeFunnelCounters.$inferSelect

// ── Lesson Engine: curriculum lessons (0049) ──────────────────────────────────
// Additive surface (ADR-0008). draft_content is the LessonDefinitionV1 under
// edit (answer keys included, admin API only); published_snapshot is what runs
// and exports read, and is immutable per published_version (DB trigger).
export type CurriculumLessonStatus = 'draft' | 'review' | 'published' | 'archived'

export const curriculumLessons = pgTable('curriculum_lessons', {
  id:                text('id').primaryKey(),
  subjectPackId:     text('subject_pack_id').notNull(),
  subject:           text('subject').notNull(),
  grade:             integer('grade').notNull(),
  moduleId:          text('module_id'),
  lessonNumber:      integer('lesson_number'),
  title:             text('title').notNull(),
  schemaVersion:     integer('schema_version').notNull(),
  status:            text('status').notNull().default('draft').$type<CurriculumLessonStatus>(),
  editVersion:       integer('edit_version').notNull().default(1),
  contentVersion:    integer('content_version').notNull().default(1),
  publishedVersion:  integer('published_version'),
  draftContent:      jsonb('draft_content').notNull().$type<Record<string, unknown>>(),
  publishedSnapshot: jsonb('published_snapshot').$type<Record<string, unknown>>(),
  createdBy:         text('created_by'),
  updatedBy:         text('updated_by'),
  reviewedBy:        text('reviewed_by'),
  publishedBy:       text('published_by'),
  reviewedAt:        timestamp('reviewed_at', { withTimezone: true }),
  publishedAt:       timestamp('published_at', { withTimezone: true }),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type CurriculumLessonRow = typeof curriculumLessons.$inferSelect

export const curriculumLessonRevisions = pgTable('curriculum_lesson_revisions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  lessonId:    text('lesson_id').notNull().references(() => curriculumLessons.id, { onDelete: 'restrict' }),
  editVersion: integer('edit_version').notNull(),
  action:      text('action').notNull(),
  snapshot:    jsonb('snapshot').notNull().$type<Record<string, unknown>>(),
  changedBy:   text('changed_by'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqLessonEditVersion: unique('curriculum_lesson_revisions_lesson_edit_version_uq').on(t.lessonId, t.editVersion),
}))

export type CurriculumLessonRevisionRow = typeof curriculumLessonRevisions.$inferSelect

// ── Lesson Engine: learning outcome directory (0057) ─────────────────────────
// Outcomes lessons may target, per subject pack. Evidence refers to them by
// id, so rows are archived, never deleted, and id/pack are immutable (trigger).
export type CurriculumOutcomeStatus = 'active' | 'archived'

export const curriculumOutcomes = pgTable('curriculum_outcomes', {
  id:            text('id').primaryKey(),
  subjectPackId: text('subject_pack_id').notNull(),
  code:          text('code').notNull(),
  titleUk:       text('title_uk').notNull(),
  titleEn:       text('title_en'),
  source:        text('source').notNull(),
  sourceRef:     text('source_ref'),
  gradeBand:     text('grade_band'),
  mappings:      jsonb('mappings').notNull().default([]).$type<{ framework: string; ref: string }[]>(),
  status:        text('status').notNull().default('active').$type<CurriculumOutcomeStatus>(),
  editVersion:   integer('edit_version').notNull().default(1),
  createdBy:     text('created_by'),
  updatedBy:     text('updated_by'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqPackCode: unique('curriculum_outcomes_pack_code_uq').on(t.subjectPackId, t.code),
}))

export type CurriculumOutcomeRow = typeof curriculumOutcomes.$inferSelect

export const curriculumOutcomeRevisions = pgTable('curriculum_outcome_revisions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  outcomeId:   text('outcome_id').notNull().references(() => curriculumOutcomes.id, { onDelete: 'restrict' }),
  editVersion: integer('edit_version').notNull(),
  action:      text('action').notNull(),
  snapshot:    jsonb('snapshot').notNull().$type<Record<string, unknown>>(),
  changedBy:   text('changed_by'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqOutcomeEditVersion: unique('curriculum_outcome_revisions_outcome_edit_version_uq').on(t.outcomeId, t.editVersion),
}))

// ── Lesson Engine: lesson runs (0050) ─────────────────────────────────────────
// A run freezes the published lesson snapshot (answer keys included, server
// only). Identity and snapshot are immutable and finished/cancelled runs are
// frozen by a DB trigger; one open run per class by a partial unique index.
export type LessonRunStatus = 'prepared' | 'active' | 'paused' | 'finished' | 'cancelled'

export const lessonRuns = pgTable('lesson_runs', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  teacherId:              uuid('teacher_id').notNull().references(() => appUsers.id, { onDelete: 'restrict' }),
  classId:                uuid('class_id').notNull().references(() => teacherClasses.id, { onDelete: 'restrict' }),
  lessonId:               text('lesson_id').notNull().references(() => curriculumLessons.id, { onDelete: 'restrict' }),
  lessonPublishedVersion: integer('lesson_published_version').notNull(),
  lessonSnapshot:         jsonb('lesson_snapshot').notNull().$type<Record<string, unknown>>(),
  status:                 text('status').notNull().default('prepared').$type<LessonRunStatus>(),
  currentStepIndex:       integer('current_step_index').notNull().default(0),
  currentBlockId:         text('current_block_id').notNull(),
  // 0051: web join. Six digits, unique while set; cleared when the run closes.
  joinCode:               text('join_code'),
  joinCodeExpiresAt:      timestamp('join_code_expires_at', { withTimezone: true }),
  createdAt:              timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt:              timestamp('started_at', { withTimezone: true }),
  pausedAt:               timestamp('paused_at', { withTimezone: true }),
  finishedAt:             timestamp('finished_at', { withTimezone: true }),
  cancelledAt:            timestamp('cancelled_at', { withTimezone: true }),
  updatedAt:              timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type LessonRunRow = typeof lessonRuns.$inferSelect

export const lessonRunStudents = pgTable('lesson_run_students', {
  id:             uuid('id').primaryKey().defaultRandom(),
  lessonRunId:    uuid('lesson_run_id').notNull().references(() => lessonRuns.id, { onDelete: 'restrict' }),
  classStudentId: uuid('class_student_id').references(() => classStudents.id, { onDelete: 'set null' }),
  status:         text('status').notNull().default('expected').$type<'expected' | 'joined' | 'absent'>(),
  joinedAt:       timestamp('joined_at', { withTimezone: true }),
  lastSeenAt:     timestamp('last_seen_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqRunStudent: unique('lesson_run_students_run_student_uq').on(t.lessonRunId, t.classStudentId),
}))

export type LessonRunStudentRow = typeof lessonRunStudents.$inferSelect

export type LessonRunEventType =
  | 'run_created' | 'run_started' | 'block_opened' | 'activity_dispatched' | 'activity_closed'
  | 'run_paused' | 'run_resumed' | 'run_finished' | 'run_cancelled'
  | 'join_opened' | 'join_closed' | 'device_joined' | 'device_mapped' | 'device_unmapped' | 'device_revoked'
  | 'devices_launched' | 'device_launched'

export const lessonRunEvents = pgTable('lesson_run_events', {
  id:          uuid('id').primaryKey().defaultRandom(),
  lessonRunId: uuid('lesson_run_id').notNull().references(() => lessonRuns.id, { onDelete: 'restrict' }),
  type:        text('type').notNull().$type<LessonRunEventType>(),
  blockId:     text('block_id'),
  actorType:   text('actor_type').notNull().$type<'teacher' | 'system' | 'device'>(),
  actorId:     uuid('actor_id'),
  payload:     jsonb('payload').notNull().default({}).$type<Record<string, unknown>>(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type LessonRunEventRow = typeof lessonRunEvents.$inferSelect

// Anonymous device joined to a run by code (0051). The teacher maps it to a
// roster student; revoked devices are kept (never deleted) for the audit trail.
export const lessonRunDevices = pgTable('lesson_run_devices', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  lessonRunId:        uuid('lesson_run_id').notNull().references(() => lessonRuns.id, { onDelete: 'restrict' }),
  pairingNumber:      integer('pairing_number').notNull(),
  lessonRunStudentId: uuid('lesson_run_student_id').references(() => lessonRunStudents.id, { onDelete: 'restrict' }),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:         timestamp('last_seen_at', { withTimezone: true }),
  expiresAt:          timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt:          timestamp('revoked_at', { withTimezone: true }),
  // 0054: opened on a lab computer by a classroom control provider.
  remoteDeviceId:     text('remote_device_id'),
  launchTokenHash:    text('launch_token_hash'),
  launchExpiresAt:    timestamp('launch_expires_at', { withTimezone: true }),
  launchedAt:         timestamp('launched_at', { withTimezone: true }),
  // 0055: sha256 of the joining browser's seat secret (remembered seats).
  seatHash:           text('seat_hash'),
}, (t) => ({
  uniqRunPairing: unique('lesson_run_devices_run_pairing_uq').on(t.lessonRunId, t.pairingNumber),
}))

export type LessonRunDeviceRow = typeof lessonRunDevices.$inferSelect

// Activity currently open on the class's devices (0052). One open per run.
export const lessonRunDispatches = pgTable('lesson_run_dispatches', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  lessonRunId:        uuid('lesson_run_id').notNull().references(() => lessonRuns.id, { onDelete: 'restrict' }),
  blockId:            text('block_id').notNull(),
  activityInstanceId: text('activity_instance_id').notNull(),
  openedBy:           uuid('opened_by').notNull().references(() => appUsers.id, { onDelete: 'restrict' }),
  openedAt:           timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt:           timestamp('closed_at', { withTimezone: true }),
})

export type LessonRunDispatchRow = typeof lessonRunDispatches.$inferSelect

// One submission from one mapped device (0052). Append-only; idempotent per
// (device, client_attempt_id). Trust is derived from the mechanic (DB-checked).
export const activityAttempts = pgTable('activity_attempts', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  clientAttemptId:    uuid('client_attempt_id').notNull(),
  lessonRunId:        uuid('lesson_run_id').notNull().references(() => lessonRuns.id, { onDelete: 'restrict' }),
  dispatchId:         uuid('dispatch_id').notNull().references(() => lessonRunDispatches.id, { onDelete: 'restrict' }),
  lessonRunDeviceId:  uuid('lesson_run_device_id').notNull().references(() => lessonRunDevices.id, { onDelete: 'restrict' }),
  lessonRunStudentId: uuid('lesson_run_student_id').notNull().references(() => lessonRunStudents.id, { onDelete: 'restrict' }),
  blockId:            text('block_id').notNull(),
  activityInstanceId: text('activity_instance_id').notNull(),
  mechanic:           text('mechanic').notNull(),
  telemetry:          text('telemetry').notNull(),
  attemptNo:          integer('attempt_no').notNull(),
  answerPayload:      jsonb('answer_payload').notNull().$type<Record<string, unknown>>(),
  correct:            integer('correct').notNull(),
  total:              integer('total').notNull(),
  mistakes:           integer('mistakes').notNull(),
  normalizedScore:    numeric('normalized_score', { precision: 5, scale: 4, mode: 'number' }).notNull(),
  durationSec:        integer('duration_sec'),
  trust:              text('trust').notNull().$type<'server-verified' | 'client-unverified'>(),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqDeviceClient: unique('activity_attempts_device_client_uq').on(t.lessonRunDeviceId, t.clientAttemptId),
}))

export type ActivityAttemptRow = typeof activityAttempts.$inferSelect

// Learning evidence (0053): one attempt of an evidence activity × one targeted
// outcome. Append-only (anonymisation aside); primary evidence is never
// client-unverified (DB-checked).
export const studentOutcomeEvidence = pgTable('student_outcome_evidence', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  lessonRunId:        uuid('lesson_run_id').notNull().references(() => lessonRuns.id, { onDelete: 'restrict' }),
  lessonRunStudentId: uuid('lesson_run_student_id').notNull().references(() => lessonRunStudents.id, { onDelete: 'restrict' }),
  classStudentId:     uuid('class_student_id').references(() => classStudents.id, { onDelete: 'set null' }),
  activityAttemptId:  uuid('activity_attempt_id').notNull().references(() => activityAttempts.id, { onDelete: 'restrict' }),
  subjectPackId:      text('subject_pack_id').notNull(),
  outcomeId:          text('outcome_id').notNull(),
  evidenceRole:       text('evidence_role').notNull().$type<'primary' | 'supporting'>(),
  trust:              text('trust').notNull().$type<'server-verified' | 'client-unverified' | 'teacher-observed'>(),
  score:              numeric('score', { precision: 5, scale: 4, mode: 'number' }).notNull(),
  observedAt:         timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqAttemptOutcome: unique('student_outcome_evidence_attempt_outcome_uq').on(t.activityAttemptId, t.outcomeId),
}))

export type StudentOutcomeEvidenceRow = typeof studentOutcomeEvidence.$inferSelect

// Lab computer → roster student, per class (0054). Configuration, not history:
// it follows the class and the student (cascade).
export const deviceAssignments = pgTable('device_assignments', {
  id:             uuid('id').primaryKey().defaultRandom(),
  teacherId:      uuid('teacher_id').notNull().references(() => appUsers.id, { onDelete: 'restrict' }),
  classId:        uuid('class_id').notNull().references(() => teacherClasses.id, { onDelete: 'cascade' }),
  remoteDeviceId: text('remote_device_id').notNull(),
  classStudentId: uuid('class_student_id').notNull().references(() => classStudents.id, { onDelete: 'cascade' }),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqClassDevice: unique('device_assignments_class_device_uq').on(t.classId, t.remoteDeviceId),
  uniqClassStudent: unique('device_assignments_class_student_uq').on(t.classId, t.classStudentId),
}))

export type DeviceAssignmentRow = typeof deviceAssignments.$inferSelect

// Class link (0055): one stable join address per class; the key is derived
// from (classId, linkVersion) by the backend, so no secret is stored here.
export const lessonClassLinks = pgTable('lesson_class_links', {
  classId:     uuid('class_id').primaryKey().references(() => teacherClasses.id, { onDelete: 'cascade' }),
  teacherId:   uuid('teacher_id').notNull().references(() => appUsers.id, { onDelete: 'restrict' }),
  linkVersion: integer('link_version').notNull().default(1),
  enabled:     boolean('enabled').notNull().default(true),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type LessonClassLinkRow = typeof lessonClassLinks.$inferSelect

// Remembered seats (0055): which roster student last sat at a lab browser.
export const lessonClassSeats = pgTable('lesson_class_seats', {
  id:             uuid('id').primaryKey().defaultRandom(),
  classId:        uuid('class_id').notNull().references(() => teacherClasses.id, { onDelete: 'cascade' }),
  seatHash:       text('seat_hash').notNull(),
  classStudentId: uuid('class_student_id').notNull().references(() => classStudents.id, { onDelete: 'cascade' }),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqClassSeat: unique('lesson_class_seats_class_seat_uq').on(t.classId, t.seatHash),
  uniqClassStudent: unique('lesson_class_seats_class_student_uq').on(t.classId, t.classStudentId),
}))

export type LessonClassSeatRow = typeof lessonClassSeats.$inferSelect

// Classroom Remote connection (0056): the teacher's integration key, encrypted
// at rest (lib/classroom-remote.ts); only a four-character hint is ever shown.
export const classroomRemoteConnections = pgTable('classroom_remote_connections', {
  teacherId:        uuid('teacher_id').primaryKey().references(() => appUsers.id, { onDelete: 'cascade' }),
  keyCiphertext:    text('key_ciphertext').notNull(),
  keyHint:          text('key_hint').notNull(),
  roomName:         text('room_name').notNull().default(''),
  organizationName: text('organization_name').notNull().default(''),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ClassroomRemoteConnectionRow = typeof classroomRemoteConnections.$inferSelect
