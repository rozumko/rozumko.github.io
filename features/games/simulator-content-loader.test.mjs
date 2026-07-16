import assert from 'node:assert/strict'
import test from 'node:test'
import { applySimulatorContent } from './simulator-content-core.js'
import { HARDWARE_SCENARIO } from './simulator-data.ts'
import { defaultSimulatorPack, normalizeSimulatorPack, SIMULATOR_ALLOWED_TARGETS } from './simulator-content-loader.ts'
import { SOFTWARE_SCENARIO } from './simulator-data.ts'
import { SIMULATOR_MECHANICS_CONTRACTS } from '../../backend/src/routes/simulator-contracts.ts'

test('simulator content pack mirrors the exact code-owned graph', () => {
  const pack = defaultSimulatorPack(HARDWARE_SCENARIO)
  assert.equal(pack.nodes.length, Object.keys(HARDWARE_SCENARIO.nodes).length)
  assert.ok(normalizeSimulatorPack(pack, HARDWARE_SCENARIO))
  pack.nodes[0].id = 'unknown'
  assert.equal(normalizeSimulatorPack(pack, HARDWARE_SCENARIO), null)
})

test('simulator content changes labels but cannot inject an unsafe transition', () => {
  const pack = defaultSimulatorPack(HARDWARE_SCENARIO)
  const start = pack.nodes.find(node => node.id === 'start')
  start.texts[0].value = 'Новий вступ'
  start.transitions[0].target = 'win'
  const scenario = applySimulatorContent(HARDWARE_SCENARIO, pack, SIMULATOR_ALLOWED_TARGETS[HARDWARE_SCENARIO.id])
  const state = scenario.initialState()
  assert.equal(scenario.nodes.start.text(state), 'Новий вступ')
  const choice = scenario.nodes.start.choices[0]
  assert.equal(typeof choice.next === 'function' ? choice.next(state) : choice.next, 'motherboard')
})

test('simulator server contracts match runtime node and slot identities', () => {
  for (const scenario of [HARDWARE_SCENARIO, SOFTWARE_SCENARIO]) {
    const pack = defaultSimulatorPack(scenario)
    const contract = SIMULATOR_MECHANICS_CONTRACTS[scenario.id]
    assert.deepEqual(pack.nodes.map(node => node.id).sort(), Object.keys(contract.nodes).sort())
    for (const node of pack.nodes) {
      assert.deepEqual(node.transitions.map(transition => transition.slot).sort(), Object.keys(contract.nodes[node.id]).sort())
      for (const [slot, targets] of Object.entries(contract.nodes[node.id])) {
        assert.deepEqual(SIMULATOR_ALLOWED_TARGETS[scenario.id]?.[`${node.id}.${slot}`] ?? [], targets)
      }
    }
  }
})

test('simulator content overlay preserves code-owned state actions', () => {
  const pack = defaultSimulatorPack(HARDWARE_SCENARIO)
  const scenario = applySimulatorContent(HARDWARE_SCENARIO, pack, SIMULATOR_ALLOWED_TARGETS[HARDWARE_SCENARIO.id])
  const state = scenario.initialState()
  const choices = scenario.nodes.cpu.choices(state)
  const install = choices.find(choice => choice.contentId === 'install-cpu')
  install.action(state)
  assert.equal(state.cpu_installed, true)
})
