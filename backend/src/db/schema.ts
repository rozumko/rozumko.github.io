import { pgTable, text, integer, boolean, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core'

export const questions = pgTable('questions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  q:           text('q').notNull(),
  code:        text('code'),
  options:     jsonb('options').notNull().$type<string[]>(),
  correct:     integer('correct').notNull(),
  explanation: text('explanation'),
  difficulty:  text('difficulty'),
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
  answers:     jsonb('answers').default({}).$type<Record<string, number>>(),
  score:       integer('score'),
  totalQ:      integer('total_q'),
  startedAt:   timestamp('started_at', { withTimezone: true }).defaultNow(),
  finishedAt:  timestamp('finished_at', { withTimezone: true }),
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
  status:     text('status').notNull().default('active'), // active | blocked
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
