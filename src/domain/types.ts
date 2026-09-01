// Shared vocabulary for the whole app. Both the recorded-log replay and the
// synthetic live feed produce `RobotEvent`s; everything downstream only knows
// about these types, never about which source produced them.

export type RobotId = string

export type RobotType = 'picker' | 'hauler'

export const STATUSES = [
  'idle',
  'active',
  'on_mission',
  'charging',
  'blocked',
  'error',
  'maintenance',
  'offline',
] as const

export type Status = (typeof STATUSES)[number]

/** A robot entry from robots.json. */
export interface RosterEntry {
  robot_id: RobotId
  robot_type: RobotType
  start: { x: number; y: number }
}

/** One line of events.jsonl, or one synthetic tick from the live feed. */
export interface RobotEvent {
  t: number
  robot_id: RobotId
  x: number
  y: number
  status: Status
  battery: number
  task_event?: 'task_started' | 'task_completed'
}

/** Latest known state of a single robot, plus bounded history for the detail view. */
export interface RobotSnapshot {
  robotId: RobotId
  type: RobotType
  x: number
  y: number
  status: Status
  battery: number
  /** sim-time of the sample currently shown */
  t: number
  /** sim-time we last received any update for this robot (for staleness) */
  lastUpdateT: number
  /** recent positions, oldest first, for the map trail */
  trail: Array<{ x: number; y: number }>
  /** recent samples, oldest first, for the detail sparkline + timeline */
  history: Array<{ t: number; battery: number; status: Status }>
  /** cumulative pixels travelled since RESET */
  distance: number
}

export interface TaskEvent {
  t: number
  robotId: RobotId
  kind: 'task_started' | 'task_completed'
}

/** One fleet-wide aggregate, sampled once per applied tick — the trend series. */
export interface TrendSample {
  t: number
  byStatus: Record<Status, number>
  /** fraction of the fleet doing work (active | on_mission), 0..1 */
  workingFrac: number
  /** fraction of the fleet that needs an operator's attention, 0..1 */
  attentionFrac: number
  /** mean battery across the fleet, 0..100 */
  avgBattery: number
}

export interface FleetState {
  /** current sim-time in seconds */
  clock: number
  robots: Record<RobotId, RobotSnapshot>
  /** stable roster order for rendering */
  order: RobotId[]
  series: TrendSample[]
  taskEvents: TaskEvent[]
}
