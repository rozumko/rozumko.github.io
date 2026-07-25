import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { normalizeSortingPack } from './sorting-pack-loader.ts'
import {
  normalizeClickTrainerPack, normalizeFactOpinionPack, normalizeScenarioPack, normalizeSequencePack,
} from './narrative-pack-loader.ts'
import { normalizeSimulatorPack } from './simulator-content-loader.ts'
import { HARDWARE_SCENARIO, SOFTWARE_SCENARIO } from './simulator-data.ts'

const PACK_DIR = fileURLToPath(new URL('../../public/content-packs/', import.meta.url))

// Longest prefix first: `fact-opinion` and `click-trainer` contain a dash, so a
// naive split on the first dash would mis-derive the gameKey.
const NORMALIZERS = [
  ['fact-opinion', normalizeFactOpinionPack],
  ['click-trainer', normalizeClickTrainerPack],
  ['sorting', normalizeSortingPack],
  ['sequence', normalizeSequencePack],
  ['scenario', normalizeScenarioPack],
]

const SIMULATOR_SCENARIOS = new Map(
  [HARDWARE_SCENARIO, SOFTWARE_SCENARIO].map(scenario => [scenario.id, scenario]),
)

/**
 * Every published pack must survive the loader that will actually read it.
 *
 * The loaders are fail-closed WITH A FALLBACK: on a rejected pack they quietly
 * return the code-side bundled content (`sorting-pack-loader.ts:57`). So a pack
 * published from Admin that trips one of the rules — `used.size !== ids.size`,
 * meaning a bin nobody sorts into, is the easy one to hit — leaves the deploy
 * green, the publication audit trail reporting success, and the child playing
 * last month's content. Nothing else in the suite would notice.
 */
test('кожен опублікований пакет проходить свій pack-loader', () => {
  const files = readdirSync(PACK_DIR).filter(name => name.endsWith('.json'))
  assert.ok(files.length, 'у public/content-packs/ немає жодного пакета')

  for (const file of files) {
    const raw = JSON.parse(readFileSync(PACK_DIR + file, 'utf8'))
    const stem = file.replace(/\.json$/, '')

    if (stem.startsWith('simulator-')) {
      const scenario = SIMULATOR_SCENARIOS.get(raw.scenarioKey)
      assert.ok(scenario, `${file}: невідомий scenarioKey «${raw.scenarioKey}»`)
      assert.ok(normalizeSimulatorPack(raw, scenario), `${file}: симулятор відхилено — гра відкотиться на вбудований контент`)
      continue
    }

    const match = NORMALIZERS.find(([prefix]) => stem.startsWith(`${prefix}-`))
    assert.ok(match, `${file}: немає нормалізатора для цього префікса`)
    const [prefix, normalize] = match
    const gameKey = stem.slice(prefix.length + 1)

    assert.equal(raw.gameKey, gameKey, `${file}: gameKey у файлі не збігається з назвою файла`)
    assert.ok(normalize(raw, gameKey), `${file}: пакет відхилено — гра відкотиться на вбудований контент`)
  }
})
