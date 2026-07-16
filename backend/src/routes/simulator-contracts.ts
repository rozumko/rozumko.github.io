export interface SimulatorMechanicsContract {
  scenarioKey: string
  mechanicsVersion: number
  stateKeys: string[]
  nodes: Record<string, Record<string, string[]>>
}

export const SIMULATOR_MECHANICS_CONTRACTS: Record<string, SimulatorMechanicsContract> = {
  'assembly-hardware': {
    scenarioKey: 'assembly-hardware', mechanicsVersion: 1,
    stateKeys: ['power_on', 'cpu_installed', 'cooler_installed', 'ram_installed', 'storage_installed', 'storage_screwed', 'gpu_installed'],
    nodes: {
      start: { inspect: [] },
      motherboard: {
        launch: [],
        'open-cpu': ['cpu', 'ram', 'storage', 'gpu', 'power'],
        'open-ram': ['cpu', 'ram', 'storage', 'gpu', 'power'],
        'open-storage': ['cpu', 'ram', 'storage', 'gpu', 'power'],
        'open-gpu': ['cpu', 'ram', 'storage', 'gpu', 'power'],
        'open-power': ['cpu', 'ram', 'storage', 'gpu', 'power'],
      },
      power: { toggle: [], back: ['motherboard'] },
      cpu: { 'install-cpu': [], 'install-cooler': [], back: ['motherboard'] },
      ram: { force: [], install: [], back: ['motherboard'] },
      fail_ram: { retry: ['ram'] },
      storage: { install: [], secure: [], back: ['motherboard'] },
      gpu: { install: [], back: ['motherboard'] },
      fail_safety: { retry: ['motherboard'] },
      win: { restart: [] },
    },
  },
  'assembly-software': {
    scenarioKey: 'assembly-software', mechanicsVersion: 1,
    stateKeys: ['power_on', 'usb_inserted', 'os_installed', 'network_connected', 'drivers_installed', 'software_installed'],
    nodes: {
      start: { 'open-desktop': [], 'toggle-power': [], 'toggle-usb': [] },
      boot_sequence: { continue: [], install: [], 'power-off': [] },
      os_install: { finish: [] },
      rebooting: { continue: [] },
      desktop: {
        finish: [],
        'open-network': ['network', 'drivers', 'software'],
        'open-drivers': ['network', 'drivers', 'software'],
        'open-software': ['network', 'drivers', 'software'],
        'power-off': [],
      },
      network: { finish: [] },
      drivers: { back: ['desktop'], install: [] },
      software: { back: ['desktop'], install: [] },
      win: { restart: [] },
    },
  },
}
