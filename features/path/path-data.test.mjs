import test from 'node:test'
import assert from 'node:assert/strict'

import { PATHS_BY_GRADE } from './path-data.ts'

// Структурний валідатор — покриває ВСІ карти в PATHS_BY_GRADE автоматично.
// Нова карта потрапляє сюди без додаткових зусиль.

for (const map of Object.values(PATHS_BY_GRADE)) {
  const prefix = `Grade ${map.grade} map`
  const byId = new Map(map.points.map(p => [p.id, p]))

  test(`${prefix}: map version is a positive integer`, () => {
    assert.ok(Number.isInteger(map.version) && map.version >= 1)
  })

  test(`${prefix}: point ids are unique`, () => {
    const ids = map.points.map(p => p.id)
    const unique = new Set(ids)
    assert.equal(unique.size, ids.length, `Duplicate point ids: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`)
  })

  test(`${prefix}: every unlockAfter id resolves to a point in the same map`, () => {
    for (const p of map.points) {
      for (const dep of p.unlockAfter) {
        assert.ok(byId.has(dep), `Point "${p.id}" unlockAfter "${dep}" does not exist in grade-${map.grade} map`)
      }
    }
  })

  test(`${prefix}: exactly one start point (unlockAfter: [])`, () => {
    const starts = map.points.filter(p => p.unlockAfter.length === 0)
    assert.equal(starts.length, 1, `Expected 1 start point, got ${starts.length}: ${starts.map(p => p.id).join(', ')}`)
  })

  test(`${prefix}: unlock graph is acyclic`, () => {
    // Kahn's algorithm: process nodes with no remaining deps
    const inDegree = new Map(map.points.map(p => [p.id, p.unlockAfter.length]))
    const queue = map.points.filter(p => p.unlockAfter.length === 0).map(p => p.id)
    let visited = 0
    const dependants = new Map(map.points.map(p => [p.id, []]))
    for (const p of map.points) {
      for (const dep of p.unlockAfter) dependants.get(dep)?.push(p.id)
    }
    while (queue.length > 0) {
      const id = /** @type {string} */ (queue.shift())
      visited++
      for (const dependent of dependants.get(id) ?? []) {
        const remaining = (inDegree.get(dependent) ?? 0) - 1
        inDegree.set(dependent, remaining)
        if (remaining === 0) queue.push(dependent)
      }
    }
    assert.equal(visited, map.points.length, `Cycle detected in grade-${map.grade} unlock graph (${map.points.length - visited} unreachable points)`)
  })

  test(`${prefix}: x/y coordinates are within 0–100`, () => {
    for (const p of map.points) {
      assert.ok(p.x >= 0 && p.x <= 100, `Point "${p.id}": x=${p.x} out of range`)
      assert.ok(p.y >= 0 && p.y <= 100, `Point "${p.id}": y=${p.y} out of range`)
    }
  })

  test(`${prefix}: every point has at least one required activity`, () => {
    for (const p of map.points) {
      const required = p.activities.filter(a => a.required)
      assert.ok(required.length > 0, `Point "${p.id}" has no required activities`)
    }
  })

  test(`${prefix}: activity ids are unique per point`, () => {
    for (const p of map.points) {
      const ids = p.activities.map(a => a.id)
      const unique = new Set(ids)
      assert.equal(unique.size, ids.length, `Point "${p.id}" has duplicate activity ids: ${ids.join(', ')}`)
    }
  })

  test(`${prefix}: all activity versions are >= 1`, () => {
    for (const p of map.points) {
      for (const a of p.activities) {
        assert.ok(a.version >= 1, `Point "${p.id}" activity "${a.id}" has version ${a.version}`)
      }
    }
  })

  test(`${prefix}: curriculum is non-empty for each point`, () => {
    for (const p of map.points) {
      assert.ok(p.curriculum.length > 0, `Point "${p.id}" has empty curriculum`)
    }
  })
}
