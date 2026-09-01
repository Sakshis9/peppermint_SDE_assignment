import { describe, expect, it } from 'vitest'
import {
  HISTORY_CAP,
  SERIES_CAP,
  TRAIL_CAP,
  fleetReducer,
  initFleetState,
} from './fleetReducer'
import type { RobotEvent, RosterEntry } from './types'

const ROSTER: RosterEntry[] = [
  { robot_id: 'r1', robot_type: 'picker', start: { x: 10, y: 10 } },
  { robot_id: 'r2', robot_type: 'hauler', start: { x: 20, y: 20 } },
]

const ev = (over: Partial<RobotEvent> & { robot_id: string; t: number }): RobotEvent => ({
  x: 0,
  y: 0,
  status: 'active',
  battery: 50,
  ...over,
})

describe('fleetReducer', () => {
  it('initialises one snapshot per roster entry plus a baseline trend sample', () => {
    const s = initFleetState(ROSTER)
    expect(s.order).toEqual(['r1', 'r2'])
    expect(s.robots.r1.x).toBe(10)
    expect(s.series).toHaveLength(1)
  })

  it('APPLY_TICK updates the addressed robot and appends exactly one trend sample', () => {
    let s = initFleetState(ROSTER)
    s = fleetReducer(s, {
      type: 'APPLY_TICK',
      t: 5,
      events: [ev({ robot_id: 'r1', t: 5, x: 100, y: 50, status: 'on_mission', battery: 44 })],
    })
    expect(s.robots.r1.x).toBe(100)
    expect(s.robots.r1.status).toBe('on_mission')
    expect(s.robots.r2.x).toBe(20) // untouched
    expect(s.clock).toBe(5)
    expect(s.series).toHaveLength(2)
    expect(s.series[1].t).toBe(5)
  })

  it('accumulates travelled distance but ignores out-of-order samples', () => {
    let s = initFleetState(ROSTER)
    s = fleetReducer(s, { type: 'APPLY_TICK', t: 5, events: [ev({ robot_id: 'r1', t: 5, x: 13, y: 14 })] })
    expect(s.robots.r1.distance).toBeCloseTo(5) // 3-4-5 triangle from (10,10)
    s = fleetReducer(s, { type: 'APPLY_TICK', t: 2, events: [ev({ robot_id: 'r1', t: 2, x: 99, y: 99 })] })
    expect(s.robots.r1.distance).toBeCloseTo(5) // stale sample, odometer unchanged
  })

  it('keeps trail, history and series within their caps', () => {
    let s = initFleetState(ROSTER)
    for (let t = 1; t <= SERIES_CAP + HISTORY_CAP + 50; t++) {
      s = fleetReducer(s, {
        type: 'APPLY_TICK',
        t,
        events: [ev({ robot_id: 'r1', t, x: t % 200, y: (t * 2) % 200 })],
      })
    }
    expect(s.robots.r1.trail.length).toBeLessThanOrEqual(TRAIL_CAP)
    expect(s.robots.r1.history.length).toBeLessThanOrEqual(HISTORY_CAP)
    expect(s.series.length).toBeLessThanOrEqual(SERIES_CAP)
  })

  it('records task events, newest first, and RESET clears them', () => {
    let s = initFleetState(ROSTER)
    s = fleetReducer(s, {
      type: 'APPLY_TICK',
      t: 5,
      events: [],
      taskEvents: [{ t: 5, robotId: 'r1', kind: 'task_started' }],
    })
    s = fleetReducer(s, {
      type: 'APPLY_TICK',
      t: 8,
      events: [],
      taskEvents: [{ t: 8, robotId: 'r1', kind: 'task_completed' }],
    })
    expect(s.taskEvents.map((e) => e.kind)).toEqual(['task_completed', 'task_started'])

    s = fleetReducer(s, { type: 'RESET', roster: ROSTER })
    expect(s.taskEvents).toHaveLength(0)
    expect(s.clock).toBe(0)
  })
})
