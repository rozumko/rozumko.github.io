import assert from 'node:assert/strict'
import test from 'node:test'
import { publicSchoolFactOpinionPack, schoolFactOpinionPack, scoreSchoolFactOpinion } from './school-fact-opinion.js'

test('fact-or-opinion has a balanced ten-statement pack for every grade', () => {
  const signatures = new Set<string>()
  for (const grade of [1, 2, 3, 4]) {
    const pack = schoolFactOpinionPack(grade)
    assert.equal(pack.length, 10)
    assert.equal(pack.filter(item => item.category === 'fact').length, 5)
    assert.equal(pack.filter(item => item.category === 'opinion').length, 5)
    assert.equal(new Set(pack.map(item => item.id)).size, 10)
    signatures.add(pack.map(item => item.id).join(','))

    const publicPack = publicSchoolFactOpinionPack(grade)
    assert.ok(publicPack.every(item => !('category' in item) && !('explanation' in item)))
  }
  assert.equal(signatures.size, 4)
})

test('fact-or-opinion scoring fails closed outside the grade pack', () => {
  assert.equal(scoreSchoolFactOpinion(1, 'g1-01', 'fact')?.correct, true)
  assert.equal(scoreSchoolFactOpinion(1, 'g1-01', 'opinion')?.correct, false)
  assert.equal(scoreSchoolFactOpinion(1, 'g4-01', 'fact'), null)
})
