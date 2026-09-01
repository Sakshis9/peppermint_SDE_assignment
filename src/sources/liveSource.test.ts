// The live generator is the trickiest part: it has to produce a stream that
// looks plausible (bounded battery, legal status moves, in-bounds motion) and
// stay deterministic so it can be tested at all.

import { describe, expect, it } from 'vitest'
import type { RobotEvent } from '../domain/types'
import { createLiveSource, isAllowedTransition } from './liveSource'
import type { Tick } from './types'

const ROSTER = [
  { robot_id: 'r1', robot_type: 'picker' as const, start: { x: 100, y: 100 } },
  { robot_id: 'r2', robot_type: 'hauler' as const, start: { x: 400, y: 200 } },
  { robot_id: 'r3', robot_type: 'picker' as const, start: { x: 700, y: 300 } },
]

/** Drive a source through `steps` increments of `dt` sim-seconds, collecting events. */
function run(seed: number, steps: number, dt: number): RobotEvent[] {
  const src = createLiveSource(ROSTER, { seed }) as ReturnType<typeof createLiveSource>
  const events: RobotEvent[] = []
  src.onTick((tick: Tick) => events.push(...tick.events))
  src._prime()
  for (let i = 0; i < steps; i++) src._advanceBy(dt)
  return events
}

describe('createLiveSource', () => {
  it('is deterministic for a given seed', () => {
    const a = run(42, 400, 0.5)
    const b = run(42, 400, 0.5)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(100)
  })

  it('produces a different stream for a different seed', () => {
    const a = run(1, 200, 0.5)
    const b = run(2, 200, 0.5)
    expect(a).not.toEqual(b)
  })

  it('keeps battery within [0, 100]', () => {
    for (const ev of run(7, 2000, 0.5)) {
      expect(ev.battery).toBeGreaterThanOrEqual(0)
      expect(ev.battery).toBeLessThanOrEqual(100)
    }
  })

  it('only lets battery rise while charging', () => {
    const events = run(7, 3000, 0.5)
    const last = new Map<string, RobotEvent>()
    for (const ev of events) {
      const prev = last.get(ev.robot_id)
      if (prev && ev.battery > prev.battery + 1e-6) {
        expect(ev.status).toBe('charging')
      }
      last.set(ev.robot_id, ev)
    }
  })

  it('keeps every robot inside the world bounds', () => {
    for (const ev of run(3, 3000, 0.5)) {
      expect(ev.x).toBeGreaterThanOrEqual(0)
      expect(ev.x).toBeLessThanOrEqual(900)
      expect(ev.y).toBeGreaterThanOrEqual(0)
      expect(ev.y).toBeLessThanOrEqual(560)
    }
  })

  it('only makes legal status transitions', () => {
    const events = run(11, 4000, 0.5)
    const last = new Map<string, RobotEvent>()
    for (const ev of events) {
      const prev = last.get(ev.robot_id)
      if (prev) {
        expect(
          isAllowedTransition(prev.status, ev.status),
          `${prev.status} -> ${ev.status}`,
        ).toBe(true)
      }
      last.set(ev.robot_id, ev)
    }
  })

  it('drives a low battery robot into charging', () => {
    // long run: at least one robot should drain low and recover on a charger
    const events = run(5, 8000, 0.5)
    const sawLow = events.some((e) => e.battery <= 15)
    const sawCharging = events.some((e) => e.status === 'charging')
    expect(sawLow).toBe(true)
    expect(sawCharging).toBe(true)
  })

  it('emits an immediate snapshot for every robot on prime', () => {
    const src = createLiveSource(ROSTER, { seed: 1 })
    const ticks: Tick[] = []
    src.onTick((t) => ticks.push(t))
    src._prime()
    expect(ticks).toHaveLength(1)
    expect(ticks[0].events.map((e) => e.robot_id).sort()).toEqual(['r1', 'r2', 'r3'])
  })
})
