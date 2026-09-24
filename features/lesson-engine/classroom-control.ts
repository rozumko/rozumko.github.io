// Classroom control boundary (stage I). The Lesson Engine talks to lab
// computers only through this interface: list devices, open URLs, read acks.
// A provider never receives names, scores or evidence — only computer ids and
// launch links whose single-use token sits in the URL fragment.
//
// Providers:
// - FakeClassroomControlProvider: in-memory lab for development, demos and
//   tests (enabled with ?classroom=fake on a loopback host only).
// - Classroom Remote: to be added once its actual protocol is available —
//   the specs forbid inventing it. Nothing else in the engine changes.
//
// Type-only imports keep this module importable by node tests.

export interface RemoteDevice {
  /** Provider-reported computer id, e.g. "PC-01". */
  id: string
  online: boolean
}

export interface DeviceLaunch {
  deviceId: string
  url: string
}

export interface DeviceLaunchResult {
  deviceId: string
  ok: boolean
  error?: string
}

export interface ClassroomControlProvider {
  readonly id: string
  readonly label: string
  listDevices(): Promise<RemoteDevice[]>
  /** Opens each URL on its device. One device failing never blocks the others. */
  launchUrls(launches: DeviceLaunch[]): Promise<DeviceLaunchResult[]>
}

export class FakeClassroomControlProvider implements ClassroomControlProvider {
  readonly id = 'fake'
  readonly label = 'Тестовий клас (без розширення)'
  /** Every URL the fake "opened", for tests and demos. */
  readonly opened: DeviceLaunch[] = []

  private readonly devices: RemoteDevice[]
  private readonly failing: ReadonlySet<string>

  // Plain fields, not parameter properties: node's type stripping runs this file in tests.
  constructor(devices: RemoteDevice[], failing: ReadonlySet<string> = new Set()) {
    this.devices = devices
    this.failing = failing
  }

  async listDevices(): Promise<RemoteDevice[]> {
    return this.devices.map(device => ({ ...device }))
  }

  async launchUrls(launches: DeviceLaunch[]): Promise<DeviceLaunchResult[]> {
    return launches.map(launch => {
      const device = this.devices.find(d => d.id === launch.deviceId)
      if (!device) return { deviceId: launch.deviceId, ok: false, error: 'Пристрій не знайдено' }
      if (!device.online) return { deviceId: launch.deviceId, ok: false, error: 'Пристрій не в мережі' }
      if (this.failing.has(launch.deviceId)) return { deviceId: launch.deviceId, ok: false, error: 'Пристрій не відповів' }
      this.opened.push(launch)
      return { deviceId: launch.deviceId, ok: true }
    })
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The provider for this page, or null when none is available (the console
 * then offers web join only). The fake is a development tool and is never
 * available on a production host.
 */
export function resolveClassroomControlProvider(location: { hostname: string; search: string }): ClassroomControlProvider | null {
  const requested = new URLSearchParams(location.search).get('classroom')
  if (requested === 'fake' && LOOPBACK_HOSTS.has(location.hostname)) {
    return new FakeClassroomControlProvider(
      [
        { id: 'PC-01', online: true },
        { id: 'PC-02', online: true },
        { id: 'PC-03', online: true },
        { id: 'PC-04', online: false },
      ],
      new Set(['PC-03']),
    )
  }
  return null
}

/** Absolute launch URL for a provider, from the plan's relative path. */
export function absoluteLaunchUrl(relative: string, base: string): string {
  return new URL(relative, base).href
}
