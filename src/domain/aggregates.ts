// Fleet-wide roll-ups. Kept pure and separate so it can be unit-tested and so
// the reducer can call it once per applied tick instead of recomputing from
// full history on every render.

import { STATUSES, type RobotSnapshot, type Status, type TrendSample } from './types'
import { ATTENTION_STATUS, LOW_BATTERY, STALE_AFTER, WORKING } from './status'

function emptyByStatus(): Record<Status, number> {
  return Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>
}

export function computeTrendSample(
  robots: RobotSnapshot[],
  clock: number,
): TrendSample {
  const byStatus = emptyByStatus()
  let working = 0
  let attention = 0
  let batterySum = 0

  for (const r of robots) {
    byStatus[r.status] += 1
    batterySum += r.battery
    // Attention takes priority: a robot can be `active`/`on_mission` (working)
    // and simultaneously low-battery or stale, so these two must be resolved
    // into one bucket per robot here — otherwise working+attention can exceed
    // 1 and the trend chart's stacked area (which assumes the three bands
    // partition the fleet) draws overlapping bands instead of a clean stack.
    const stale = clock - r.lastUpdateT > STALE_AFTER
    if (ATTENTION_STATUS.has(r.status) || r.battery <= LOW_BATTERY || stale) {
      attention += 1
    } else if (WORKING.has(r.status)) {
      working += 1
    }
  }

  const n = robots.length || 1
  return {
    t: clock,
    byStatus,
    workingFrac: working / n,
    attentionFrac: attention / n,
    avgBattery: batterySum / n,
  }
}

export interface FleetSummary {
  total: number
  working: number
  charging: number
  attention: number
  avgBattery: number
}

export function summarize(robots: RobotSnapshot[], clock: number): FleetSummary {
  const s = computeTrendSample(robots, clock)
  return {
    total: robots.length,
    working: s.byStatus.active + s.byStatus.on_mission,
    charging: s.byStatus.charging,
    attention: Math.round(s.attentionFrac * robots.length),
    avgBattery: s.avgBattery,
  }
}
