// Export administrator-published game content packs for static delivery.

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { and, inArray, isNotNull, ne } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { missions } from '../src/db/schema.js'
import { normalizeEditableMission } from '../src/routes/mission-editorial.js'
import { SCENARIOS_DIGITAL_SAFETY } from '../../features/games/scenarios-data.js'
import { SEQUENCE_SETS_G2 } from '../../features/games/sequence-data.js'
import { INFO_SORT_LEVELS, MULTISORT_LEVELS, SORTING_ATTRIBUTES_LEVELS } from '../../features/games/sorting-data.js'
import { HARDWARE_SCENARIO, SOFTWARE_SCENARIO } from '../../features/games/simulator-data.js'
import { defaultSimulatorPack } from '../../features/games/simulator-content-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../../public/content-packs')
const supportedKinds = ['sorting-game', 'sequence-game', 'scenario-game', 'simulator-game']
const rows = await db.select().from(missions).where(and(
  inArray(missions.kind, supportedKinds), isNotNull(missions.publishedVersion), ne(missions.status, 'archived'),
))
if (rows.length === 0) {
  // Fail before the stale-file cleanup below wipes every deployed pack.
  throw new Error('No published game packs: the export role cannot read public.missions (RLS/GRANT) or published content is gone.')
}

const legacyFallbacks: Record<string, { prefix: string; gameKey: string; field: string; content: unknown }> = {
  'game-sorting-attributes-grade1': { prefix: 'sorting', gameKey: 'attributes', field: 'levels', content: SORTING_ATTRIBUTES_LEVELS },
  'game-sorting-information-grade1': { prefix: 'sorting', gameKey: 'infosort', field: 'levels', content: INFO_SORT_LEVELS },
  'game-multisort-attributes-grade2': { prefix: 'sorting', gameKey: 'multisort', field: 'levels', content: MULTISORT_LEVELS },
  'game-sequence-algorithms-grade2': { prefix: 'sequence', gameKey: 'algorithms-g2', field: 'sets', content: SEQUENCE_SETS_G2 },
  'game-scenarios-digital-safety-grade2': { prefix: 'scenario', gameKey: 'digital-safety', field: 'items', content: SCENARIOS_DIGITAL_SAFETY },
}
const legacySimulatorFallbacks = {
  'game-simulator-assembly-hardware': defaultSimulatorPack(HARDWARE_SCENARIO),
  'game-simulator-assembly-software': defaultSimulatorPack(SOFTWARE_SCENARIO),
} as const

mkdirSync(outDir, { recursive: true })
const files = new Map<string, string>()
function writePack(row: typeof rows[number], prefix: string, gameKey: string, field: string, content: unknown) {
  const file = `${prefix}-${gameKey}.json`
  if (files.has(file)) throw new Error(`duplicate gameKey with ${files.get(file)}`)
  files.set(file, row.id)
  writeFileSync(join(outDir, file), JSON.stringify({
    id: row.id, gameKey, version: row.publishedVersion, title: row.title, [field]: content,
  }, null, 2) + '\n', 'utf8')
  console.log(`${file}: v${row.publishedVersion}`)
}

function writeSimulatorPack(row: typeof rows[number], pack: ReturnType<typeof defaultSimulatorPack>) {
  const file = `simulator-${pack.scenarioKey}.json`
  if (files.has(file)) throw new Error(`duplicate scenarioKey with ${files.get(file)}`)
  files.set(file, row.id)
  writeFileSync(join(outDir, file), JSON.stringify({
    id: row.id, version: row.publishedVersion, title: row.title, ...pack,
  }, null, 2) + '\n', 'utf8')
  console.log(`${file}: v${row.publishedVersion}`)
}

for (const row of rows) {
  try {
    const snapshot = normalizeEditableMission(row.publishedSnapshot)
    if (snapshot.kind === 'sorting-game') writePack(row, 'sorting', snapshot.config.gameKey, 'levels', snapshot.config.levels)
    else if (snapshot.kind === 'sequence-game') writePack(row, 'sequence', snapshot.config.gameKey, 'sets', snapshot.config.sets)
    else if (snapshot.kind === 'scenario-game') writePack(row, 'scenario', snapshot.config.gameKey, 'items', snapshot.config.items)
    else if (snapshot.kind === 'simulator-game') writeSimulatorPack(row, snapshot.config)
    else throw new Error('unsupported published mission kind')
  } catch (error) {
    const simulatorFallback = legacySimulatorFallbacks[row.id as keyof typeof legacySimulatorFallbacks]
    if (simulatorFallback) {
      writeSimulatorPack(row, simulatorFallback)
      console.warn(`${row.id}: exported code-owned simulator defaults; open and publish it in Admin to move presentation content to the database`)
      continue
    }
    const fallback = legacyFallbacks[row.id]
    if (!fallback) {
      console.warn(`${row.id}: skipped invalid pack (${(error as Error).message})`)
      continue
    }
    writePack(row, fallback.prefix, fallback.gameKey, fallback.field, fallback.content)
    console.warn(`${row.id}: exported bundled legacy content; open and publish it in Admin to move source-of-truth to the database`)
  }
}
for (const file of readdirSync(outDir)) {
  if (/^(?:sorting|sequence|scenario|simulator)-[a-z0-9-]+\.json$/.test(file) && !files.has(file)) unlinkSync(join(outDir, file))
}
console.log(`Exported ${files.size} game content packs.`)
process.exit(0)
