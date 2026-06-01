import test from 'node:test'
import assert from 'node:assert/strict'

import { awardLabel, getAward, percent } from '../../utils/certificate.ts'

test('getAward applies the configured inclusive lower boundaries', () => {
  assert.deepEqual(getAward(79, 100), {
    kind: 'certificate',
    title: 'Сертифікат учасника',
    place: '',
  })
  assert.equal(awardLabel(80, 100), 'Диплом · III місце')
  assert.equal(awardLabel(90, 100), 'Диплом · II місце')
  assert.equal(awardLabel(95, 100), 'Диплом · I місце')
  assert.equal(awardLabel(100, 100), 'Диплом · I місце')
})

test('getAward uses the same non-inflated percentage shown to the teacher', () => {
  assert.equal(percent(89, 99), 89)
  assert.equal(awardLabel(89, 99), 'Диплом · III місце')
  assert.equal(percent(94, 99), 94)
  assert.equal(awardLabel(94, 99), 'Диплом · II місце')
})

test('percent handles invalid and historical out-of-range values safely', () => {
  assert.equal(percent(null, null), 0)
  assert.equal(percent(4, 0), 0)
  assert.equal(percent(-1, 10), 0)
  assert.equal(percent(11, 10), 100)
})
