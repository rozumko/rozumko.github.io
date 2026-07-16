import { applySimulatorContent, buildSimulatorContentPack } from './simulator-content-core.js'
import type { SimScenario, SimulatorContentPack, SimulatorNodeContent, SimulatorTextVariant } from './simulator-engine.js'

export const SIMULATOR_STATE_KEYS: Record<string, string[]> = {
  'assembly-hardware': ['power_on', 'cpu_installed', 'cooler_installed', 'ram_installed', 'storage_installed', 'storage_screwed', 'gpu_installed'],
  'assembly-software': ['power_on', 'usb_inserted', 'os_installed', 'network_connected', 'drivers_installed', 'software_installed'],
}

export const SIMULATOR_ALLOWED_TARGETS: Record<string, Record<string, readonly string[]>> = {
  'assembly-hardware': {
    'motherboard.open-cpu': ['cpu', 'ram', 'storage', 'gpu', 'power'],
    'motherboard.open-ram': ['cpu', 'ram', 'storage', 'gpu', 'power'],
    'motherboard.open-storage': ['cpu', 'ram', 'storage', 'gpu', 'power'],
    'motherboard.open-gpu': ['cpu', 'ram', 'storage', 'gpu', 'power'],
    'motherboard.open-power': ['cpu', 'ram', 'storage', 'gpu', 'power'],
    'power.back': ['motherboard'], 'cpu.back': ['motherboard'], 'ram.back': ['motherboard'],
    'fail_ram.retry': ['ram'], 'storage.back': ['motherboard'], 'gpu.back': ['motherboard'],
    'fail_safety.retry': ['motherboard'],
  },
  'assembly-software': {
    'desktop.open-network': ['network', 'drivers', 'software'],
    'desktop.open-drivers': ['network', 'drivers', 'software'],
    'desktop.open-software': ['network', 'drivers', 'software'],
    'drivers.back': ['desktop'], 'software.back': ['desktop'],
  },
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : ''
}

function variants(raw: unknown, expected: SimulatorTextVariant[]): SimulatorTextVariant[] | null {
  if (!Array.isArray(raw) || raw.length !== expected.length) return null
  const expectedSources = new Set(expected.map(variant => variant.source))
  const normalized: SimulatorTextVariant[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null
    const item = entry as Record<string, unknown>
    const source = text(item.source, 600); const value = text(item.value, 600)
    if (!source || !value || !expectedSources.delete(source)) return null
    normalized.push({ source, value })
  }
  return expectedSources.size ? null : normalized
}

export function defaultSimulatorPack(scenario: SimScenario): SimulatorContentPack {
  return buildSimulatorContentPack(scenario, SIMULATOR_STATE_KEYS[scenario.id] ?? [], 1)
}

export function normalizeSimulatorPack(raw: unknown, scenario: SimScenario): SimulatorContentPack | null {
  if (typeof raw !== 'object' || raw === null) return null
  const pack = raw as Record<string, unknown>
  if (pack.scenarioKey !== scenario.id || pack.mechanicsVersion !== 1 || !Array.isArray(pack.nodes)) return null
  const defaults = defaultSimulatorPack(scenario)
  if (pack.nodes.length !== defaults.nodes.length) return null
  const rawNodes = new Map<string, Record<string, unknown>>()
  for (const node of pack.nodes) {
    if (typeof node !== 'object' || node === null) return null
    const value = node as Record<string, unknown>
    const id = text(value.id, 80)
    if (!id || rawNodes.has(id)) return null
    rawNodes.set(id, value)
  }
  const nodes: SimulatorNodeContent[] = []
  for (const expected of defaults.nodes) {
    const node = rawNodes.get(expected.id)
    if (!node) return null
    const nodeTexts = variants(node.texts, expected.texts)
    const icon = text(node.icon, 16)
    if (!nodeTexts || !icon || !Array.isArray(node.transitions) || node.transitions.length !== expected.transitions.length) return null
    const transitions = [] as SimulatorNodeContent['transitions']
    for (const expectedTransition of expected.transitions) {
      const rawTransition = node.transitions.find(item => typeof item === 'object' && item !== null
        && (item as Record<string, unknown>).slot === expectedTransition.slot) as Record<string, unknown> | undefined
      if (!rawTransition) return null
      const labels = variants(rawTransition.labels, expectedTransition.labels)
      if (!labels) return null
      const transition = { slot: expectedTransition.slot, labels } as SimulatorNodeContent['transitions'][number]
      if (rawTransition.target !== undefined && rawTransition.target !== null && rawTransition.target !== '') {
        const target = text(rawTransition.target, 80)
        if (!(SIMULATOR_ALLOWED_TARGETS[scenario.id]?.[`${expected.id}.${expectedTransition.slot}`] ?? []).includes(target)) return null
        transition.target = target
      }
      transitions.push(transition)
    }
    const content: SimulatorNodeContent = { id: expected.id, icon, texts: nodeTexts, transitions }
    const info = text(node.info, 600)
    if (info) content.info = info
    nodes.push(content)
  }
  return { scenarioKey: scenario.id, mechanicsVersion: 1, nodes }
}

export async function loadSimulatorScenario(scenario: SimScenario): Promise<SimScenario> {
  try {
    const response = await fetch(`/content-packs/simulator-${encodeURIComponent(scenario.id)}.json`)
    if (!response.ok) return scenario
    const pack = normalizeSimulatorPack(await response.json(), scenario)
    return pack ? applySimulatorContent(scenario, pack, SIMULATOR_ALLOWED_TARGETS[scenario.id] ?? {}) : scenario
  } catch { return scenario }
}
