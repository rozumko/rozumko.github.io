import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSchoolTopicSelection, SCHOOL_TOPIC_IDS, SCHOOL_TOPIC_SELECTIONS } from './school-topics.js'

test('school topic allowlist exposes the NUSH teacher-facing topic ids', () => {
  assert.deepEqual(SCHOOL_TOPIC_IDS, [
    'information-messages',
    'computer-devices',
    'files-environment',
    'digital-creation',
    'data-tables-charts',
    'algorithms-executors',
    'programming-scratch',
    'internet-networks-search',
    'digital-safety',
  ])
})

test('school topic selection splits algorithms from Scratch through preferred concept keys', () => {
  assert.deepEqual(resolveSchoolTopicSelection('algorithms-executors'), {
    track: 'informatics',
    topic: 'algorithms-programming',
    preferredConceptKeys: ['algorithms', 'debugging'],
  })
  assert.deepEqual(resolveSchoolTopicSelection('programming-scratch'), {
    track: 'informatics',
    topic: 'algorithms-programming',
    preferredConceptKeys: ['repetition', 'decomposition', 'debugging'],
  })
})

test('school topic selection splits files from content authoring through preferred concept keys', () => {
  assert.deepEqual(resolveSchoolTopicSelection('files-environment'), {
    track: 'informatics',
    topic: 'digital-tools',
    preferredConceptKeys: ['classification', 'algorithms'],
  })
  assert.deepEqual(resolveSchoolTopicSelection('digital-creation'), {
    track: 'informatics',
    topic: 'digital-tools',
    preferredConceptKeys: ['decomposition', 'patterns'],
  })
})

// Guards the whole table, not just today's two collisions: teacher topics sharing
// one track/topic are indistinguishable to the picker unless each declares its own
// concept keys, so a future topic added without them must fail here.
test('school topics sharing a track/topic stay distinguishable by concept keys', () => {
  const byTag = new Map<string, string[]>()
  for (const [id, sel] of Object.entries(SCHOOL_TOPIC_SELECTIONS)) {
    const tag = `${sel.track}/${sel.topic}`
    byTag.set(tag, [...(byTag.get(tag) ?? []), id])
  }

  for (const [tag, ids] of byTag) {
    if (ids.length < 2) continue
    for (const id of ids) {
      const keys = SCHOOL_TOPIC_SELECTIONS[id as keyof typeof SCHOOL_TOPIC_SELECTIONS].preferredConceptKeys
      assert.ok(keys?.length, `${id} ділить ${tag} з ${ids.filter(x => x !== id).join(', ')}, але не має preferredConceptKeys`)
    }
    const fingerprints = ids.map(id =>
      [...SCHOOL_TOPIC_SELECTIONS[id as keyof typeof SCHOOL_TOPIC_SELECTIONS].preferredConceptKeys!].sort().join(','))
    assert.equal(new Set(fingerprints).size, ids.length,
      `теми ${ids.join(', ')} ділять ${tag} і мають однаковий набір preferredConceptKeys`)
  }
})

test('unknown school topic is rejected fail-closed', () => {
  assert.throws(() => resolveSchoolTopicSelection('cambridge-custom-topic'), /Unknown School topic/)
})
