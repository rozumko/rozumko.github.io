import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  assertQuestionDistribution,
  normalizeQuestionChannels,
  questionDistributionIssues,
} from './question-channels.js'

test('question channels are allowlisted, deduplicated and stored in canonical order', () => {
  assert.deepEqual(
    normalizeQuestionChannels(['path', 'class_game', 'path']),
    ['class_game', 'path'],
  )
  assert.throws(() => normalizeQuestionChannels(['public']), /канал/)
  assert.throws(() => normalizeQuestionChannels('path'), /масив/)
})

test('main-round questions cannot have training channels', () => {
  assert.doesNotThrow(() => assertQuestionDistribution(true, []))
  assert.throws(() => assertQuestionDistribution(true, ['path']), /основного туру/)
})

test('published training readiness fails closed without a usage channel', () => {
  assert.deepEqual(questionDistributionIssues(false, []), ['не вибрано жодного розділу використання'])
  assert.deepEqual(questionDistributionIssues(false, ['class_game']), [])
  assert.deepEqual(questionDistributionIssues(true, []), [])
})

test('migration and static export keep channel boundaries fail closed', () => {
  const migration = readFileSync(new URL('../../drizzle/0044_add_question_channels.sql', import.meta.url), 'utf8')
  const exporter = readFileSync(new URL('../../scripts/export-practice-questions.ts', import.meta.url), 'utf8')
  const publication = readFileSync(new URL('./content-publication.ts', import.meta.url), 'utf8')
  const journal = readFileSync(new URL('../../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  assert.match(migration, /channels <@ ARRAY\['class_game', 'path', 'olympiad_training'\]/)
  assert.match(migration, /SET is_olympiad = false\s+WHERE is_olympiad IS NULL/)
  assert.match(migration, /ALTER COLUMN is_olympiad SET NOT NULL/)
  assert.ok(
    migration.indexOf('SET is_olympiad = false') < migration.indexOf('SET channels = CASE'),
    'legacy null normalization must happen before channel backfill',
  )
  assert.match(migration, /is_olympiad IS NOT TRUE OR cardinality\(channels\) = 0/)
  assert.match(migration, /editorial_status <> 'published' OR cardinality\(channels\) > 0/)
  assert.match(exporter, /arrayContains\(questions\.channels, \['olympiad_training'\]\)/)
  assert.match(publication, /arrayContains\(questions\.channels, \['olympiad_training'\]\)/)
  assert.match(journal, /"tag": "0044_add_question_channels"/)
})
