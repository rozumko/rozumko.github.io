import { pgTable, text, integer, boolean, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core'

export const questions = pgTable('questions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  firebaseId:  text('firebase_id').unique(),
  q:           text('q').notNull(),
  code:        text('code'),
  options:     jsonb('options').notNull().$type<string[]>(),
  correct:     integer('correct').notNull(),
  explanation: text('explanation'),
  difficulty:  text('difficulty'),
  grade:       integer('grade'),
  subject:     text('subject'),
  isOlympiad:  boolean('is_olympiad').default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type Question = typeof questions.$inferSelect
export type NewQuestion = typeof questions.$inferInsert

export const accessCodes = pgTable('access_codes', {
  id:         uuid('id').primaryKey().defaultRandom(),
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
