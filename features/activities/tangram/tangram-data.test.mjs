import assert from 'node:assert/strict'
import test from 'node:test'
import { TANGRAM_PIECES, TANGRAM_PUZZLES } from './tangram-data.ts'

const EPSILON = 1e-6

function localPoints(family) {
  const piece = TANGRAM_PIECES.find(item => item.family === family)
  assert.ok(piece, `missing piece family ${family}`)
  return piece.points.split(' ').map(pair => pair.split(',').map(Number))
}

function polygonFor(target) {
  const radians = target.angle * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return localPoints(target.family).map(([rawX, y]) => {
    const x = target.flipped ? -rawX : rawX
    return [target.x + x * cos - y * sin, target.y + x * sin + y * cos]
  })
}

function cross([ax, ay], [bx, by]) {
  return ax * by - ay * bx
}

function subtract([ax, ay], [bx, by]) {
  return [ax - bx, ay - by]
}

function signedArea(polygon) {
  return polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length]
    return sum + cross(point, next)
  }, 0) / 2
}

function lineIntersection(start, end, clipStart, clipEnd) {
  const subjectDirection = subtract(end, start)
  const clipDirection = subtract(clipEnd, clipStart)
  const denominator = cross(subjectDirection, clipDirection)
  if (Math.abs(denominator) < EPSILON) return end
  const ratio = cross(subtract(clipStart, start), clipDirection) / denominator
  return [
    start[0] + subjectDirection[0] * ratio,
    start[1] + subjectDirection[1] * ratio,
  ]
}

function intersectConvex(subject, clip) {
  let output = subject
  const orientation = Math.sign(signedArea(clip)) || 1
  for (let index = 0; index < clip.length; index += 1) {
    const clipStart = clip[index]
    const clipEnd = clip[(index + 1) % clip.length]
    const input = output
    output = []
    if (!input.length) break
    const inside = point => orientation * cross(
      subtract(clipEnd, clipStart),
      subtract(point, clipStart),
    ) >= -EPSILON
    let start = input[input.length - 1]
    for (const end of input) {
      if (inside(end)) {
        if (!inside(start)) output.push(lineIntersection(start, end, clipStart, clipEnd))
        output.push(end)
      } else if (inside(start)) {
        output.push(lineIntersection(start, end, clipStart, clipEnd))
      }
      start = end
    }
  }
  return output
}

function overlapArea(first, second) {
  const intersection = intersectConvex(first, second)
  return intersection.length < 3 ? 0 : Math.abs(signedArea(intersection))
}

function sharedBoundaryLength(first, second) {
  let shared = 0
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex]
    const firstEnd = first[(firstIndex + 1) % first.length]
    const firstVector = subtract(firstEnd, firstStart)
    const firstLength = Math.hypot(...firstVector)
    const unit = firstVector.map(value => value / firstLength)
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex]
      const secondEnd = second[(secondIndex + 1) % second.length]
      const secondVector = subtract(secondEnd, secondStart)
      const secondLength = Math.hypot(...secondVector)
      if (Math.abs(cross(firstVector, secondVector)) > EPSILON * firstLength * secondLength) continue
      if (Math.abs(cross(firstVector, subtract(secondStart, firstStart))) > EPSILON * firstLength) continue
      const startProjection = subtract(secondStart, firstStart)[0] * unit[0]
        + subtract(secondStart, firstStart)[1] * unit[1]
      const endProjection = subtract(secondEnd, firstStart)[0] * unit[0]
        + subtract(secondEnd, firstStart)[1] * unit[1]
      shared += Math.max(0, Math.min(firstLength, Math.max(startProjection, endProjection))
        - Math.max(0, Math.min(startProjection, endProjection)))
    }
  }
  return shared
}

test('every silhouette uses all seven tangram pieces', () => {
  const requiredFamilies = TANGRAM_PIECES.map(piece => piece.family).sort()
  for (const puzzle of TANGRAM_PUZZLES) {
    assert.equal(puzzle.targets.length, 7)
    assert.deepEqual(puzzle.targets.map(target => target.family).sort(), requiredFamilies)
    assert.equal(new Set(puzzle.targets.map(target => target.id)).size, 7)
    for (const target of puzzle.targets) {
      assert.equal(target.angle % 45, 0)
      assert.ok(target.x >= 350 && target.x <= 850)
      assert.ok(target.y >= 20 && target.y <= 480)
    }
  }
})

test('every silhouette is one connected, overlap-free tangram assembly', () => {
  for (const puzzle of TANGRAM_PUZZLES) {
    const polygons = puzzle.targets.map(polygonFor)
    const neighbours = polygons.map(() => new Set())

    for (let first = 0; first < polygons.length; first += 1) {
      for (let second = first + 1; second < polygons.length; second += 1) {
        assert.ok(
          overlapArea(polygons[first], polygons[second]) < 0.01,
          `${puzzle.id}: targets ${puzzle.targets[first].id} and ${puzzle.targets[second].id} overlap`,
        )
        if (sharedBoundaryLength(polygons[first], polygons[second]) > 0.01) {
          neighbours[first].add(second)
          neighbours[second].add(first)
        }
      }
    }

    const reached = new Set([0])
    const queue = [0]
    while (queue.length) {
      const current = queue.shift()
      for (const neighbour of neighbours[current]) {
        if (reached.has(neighbour)) continue
        reached.add(neighbour)
        queue.push(neighbour)
      }
    }
    assert.equal(reached.size, polygons.length, `${puzzle.id}: silhouette contains disconnected pieces`)
  }
})
