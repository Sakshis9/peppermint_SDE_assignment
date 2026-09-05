// The challenge deliberately leaves "working" and "needs attention" undefined and
// asks to make a defensible call. That call lives here, in one place, so the
// map, the list, the stat cards and the trend chart all agree.
//
// Reasoning:
//  - WORKING      the robot is productively busy right now. `active` and
//                 `on_mission` are the two "doing a job" states.
//  - AVAILABLE    healthy but not on a job: `idle` (ready) and `charging`
//                 (deliberately unavailable, will return on its own).
//  - ATTENTION    an operator should look now: `error` / `blocked` are stuck,
//                 `offline` has dropped out, `maintenance` is out of service.
//
// On top of the status we also flag a robot for attention when its battery is
// low (it will strand mid-aisle) or when we have not heard from it recently
// (a silent robot is indistinguishable from a dead one).

import type { RobotSnapshot, Status } from './types'

export const WORKING: ReadonlySet<Status> = new Set<Status>(['active', 'on_mission'])
export const AVAILABLE: ReadonlySet<Status> = new Set<Status>(['idle', 'charging'])
export const ATTENTION_STATUS: ReadonlySet<Status> = new Set<Status>([
  'blocked',
  'error',
  'maintenance',
  'offline',
])

/** Battery at or below this is treated as "needs attention". */
export const LOW_BATTERY = 20

/** No update for this many sim-seconds ⇒ the robot is considered stale. */
export const STALE_AFTER = 30

export function isWorking(status: Status): boolean {
  return WORKING.has(status)
}

export function isStale(snap: Pick<RobotSnapshot, 'lastUpdateT'>, clock: number): boolean {
  return clock - snap.lastUpdateT > STALE_AFTER
}

export interface AttentionResult {
  needsAttention: boolean
  reasons: string[]
}

export function attention(
  snap: Pick<RobotSnapshot, 'status' | 'battery' | 'lastUpdateT'>,
  clock: number,
): AttentionResult {
  const reasons: string[] = []
  if (ATTENTION_STATUS.has(snap.status)) reasons.push(`status: ${snap.status}`)
  if (snap.battery <= LOW_BATTERY) reasons.push(`battery ${snap.battery.toFixed(0)}%`)
  if (isStale(snap, clock)) reasons.push('no recent update')
  return { needsAttention: reasons.length > 0, reasons }
}

export function needsAttention(
  snap: Pick<RobotSnapshot, 'status' | 'battery' | 'lastUpdateT'>,
  clock: number,
): boolean {
  return attention(snap, clock).needsAttention
}

// Colours are shared by every view. Chosen to stay distinguishable for the most
// common colour-vision deficiencies (no red/green-only contrasts carry meaning
// on their own — status text is always shown too).
export const STATUS_COLOR: Record<Status, string> = {
  idle: '#94a3b8', // slate-400
  active: '#22c55e', // green-500
  on_mission: '#0ea5e9', // sky-500
  charging: '#a855f7', // purple-500
  blocked: '#f97316', // orange-500
  error: '#ef4444', // red-500
  maintenance: '#eab308', // yellow-500
  offline: '#64748b', // slate-500
}

export const STATUS_LABEL: Record<Status, string> = {
  idle: 'Idle',
  active: 'Active',
  on_mission: 'On mission',
  charging: 'Charging',
  blocked: 'Blocked',
  error: 'Error',
  maintenance: 'Maintenance',
  offline: 'Offline',
}

/** Coarse buckets used by the trend chart's stacked area. */
export type TrendBucket = 'working' | 'available' | 'attention'

export const TREND_BUCKETS: TrendBucket[] = ['working', 'available', 'attention']

export const BUCKET_COLOR: Record<TrendBucket, string> = {
  working: '#0ea5e9',
  available: '#94a3b8',
  attention: '#ef4444',
}

export const BUCKET_LABEL: Record<TrendBucket, string> = {
  working: 'Working',
  available: 'Available',
  attention: 'Needs attention',
}

export function bucketOf(status: Status): TrendBucket {
  if (WORKING.has(status)) return 'working'
  if (ATTENTION_STATUS.has(status)) return 'attention'
  return 'available'
}
