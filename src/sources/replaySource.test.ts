import { describe, expect, it } from 'vitest'
import type { RobotEvent } from '../domain/types'
import { createReplaySource } from './replaySource'
import type { Tick } from './types'

function makeLog(): RobotEvent[] {
  const out: RobotEvent[] = []
  for (let t = 0; t <= 100; t += 10) {
    out.push({ t, robot_id: 'r1', x: t, y: 0, status: 'active', battery: 100 - t })
    out.push({ t, robot_id: 'r2', x: 0, y: t, status: 'idle', battery: 100 - t / 2 })
  }
  return out
}

describe('createReplaySource', () => {
  it('emits recorded events in non-decreasing time order', () => {
    const src = createReplaySource(makeLog(), { speed: 1, loop: false })
    const seen: RobotEvent[] = []
    src.onTick((tick: Tick) => seen.push(...tick.events))
    for (let i = 0; i < 120; i++) src._advanceBy(1) // 120 sim-seconds at 1x

    expect(seen.length).toBe(22)
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].t).toBeGreaterThanOrEqual(seen[i - 1].t)
    }
  })

  it('releases more events per unit real time at higher speed', () => {
    const count = (speed: number) => {
      const src = createReplaySource(makeLog(), { speed, loop: false })
      let n = 0
      src.onTick((tick: Tick) => (n += tick.events.length))
      src._advanceBy(2) // 2 real seconds
      return n
    }
    expect(count(20)).toBeGreaterThan(count(1))
  })

  it('seek leaves each robot on its latest sample at or before the target', () => {
    const src = createReplaySource(makeLog(), { speed: 1, loop: false })
    let last: Tick | null = null
    src.onTick((tick) => (last = tick))
    src.seek!(55)

    expect(last).not.toBeNull()
    const byId = new Map(last!.events.map((e) => [e.robot_id, e]))
    expect(byId.get('r1')!.t).toBe(50)
    expect(byId.get('r2')!.t).toBe(50)
    expect(last!.t).toBe(55)
  })

  it('reports the log duration', () => {
    expect(createReplaySource(makeLog()).duration).toBe(100)
  })
})
