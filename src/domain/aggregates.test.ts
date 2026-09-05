import { describe, expect, it } from 'vitest'
import { computeTrendSample, summarize } from './aggregates'
import type { RobotSnapshot, Status } from './types'

const snap = (status: Status, battery: number, lastUpdateT = 100): RobotSnapshot => ({
  robotId: 'x',
  type: 'picker',
  x: 0,
  y: 0,
  status,
  battery,
  t: lastUpdateT,
  lastUpdateT,
  trail: [],
  history: [],
  distance: 0,
})

describe('computeTrendSample', () => {
  it('counts statuses and computes the working fraction', () => {
    const robots = [
      snap('active', 90),
      snap('on_mission', 80),
      snap('idle', 70),
      snap('charging', 60),
    ]
    const s = computeTrendSample(robots, 100)
    expect(s.byStatus.active).toBe(1)
    expect(s.byStatus.on_mission).toBe(1)
    expect(s.workingFrac).toBe(0.5)
    expect(s.avgBattery).toBe(75)
  })

  it('flags low battery, attention statuses and stale robots for attention', () => {
    const robots = [
      snap('active', 90), // fine
      snap('active', 10), // low battery
      snap('error', 90), // attention status
      snap('idle', 90, 50), // stale: clock 100 - 50 > 30
    ]
    const s = computeTrendSample(robots, 100)
    expect(s.attentionFrac).toBe(0.75)
  })

  it('keeps working and attention mutually exclusive so the trend chart can stack them', () => {
    // a robot can be `active` (working) and simultaneously low-battery: it
    // must land in exactly one bucket, or workingFrac + attentionFrac > 1 and
    // the stacked-area chart draws overlapping bands (see TrendChart.tsx)
    const robots = [
      snap('active', 10), // working AND low battery -> attention wins
      snap('on_mission', 90), // working only
      snap('idle', 90), // available
      snap('error', 90), // attention only
    ]
    const s = computeTrendSample(robots, 100)
    expect(s.workingFrac).toBe(0.25) // only the on_mission robot
    expect(s.attentionFrac).toBe(0.5) // the low-battery active + the error
    expect(s.workingFrac + s.attentionFrac).toBeLessThanOrEqual(1)
  })
})

describe('summarize', () => {
  it('rolls the fleet up into current-value cards', () => {
    const robots = [snap('active', 90), snap('charging', 20), snap('offline', 55)]
    const out = summarize(robots, 100)
    expect(out).toMatchObject({ total: 3, working: 1, charging: 1 })
    expect(out.attention).toBe(2) // the charging(20%, low) and the offline one
  })
})
