// The single owner of fleet state. Both feeds dispatch the same actions here, so
// the map, list, detail and trend views never need to know whether they are
// looking at the recorded log or the live simulation.
//
// Shape rationale (ANSWERS.md Q1):
//  - `robots` is a dict keyed by id: the map and list need O(1) "where is r6 now",
//    and updates touch one robot at a time.
//  - each snapshot carries a *bounded* `trail` / `history` so the detail view and
//    map trails are ready without scanning a global event log, and memory stays
//    flat during a long live run or a 60x replay.
//  - `series` is a *precomputed* array of fleet aggregates, one per applied tick.
//    Trends are the common operator question, and deriving them once on write is
//    far cheaper than recomputing from history on every animation frame.

import { computeTrendSample } from './aggregates'
import type {
  FleetState,
  RobotEvent,
  RobotSnapshot,
  RosterEntry,
  TaskEvent,
} from './types'

export const TRAIL_CAP = 24
export const HISTORY_CAP = 256
export const SERIES_CAP = 1000
export const TASK_EVENT_CAP = 50

export type FleetAction =
  | { type: 'RESET'; roster: RosterEntry[]; battery?: Record<string, number> }
  | { type: 'APPLY_TICK'; t: number; events: RobotEvent[]; taskEvents?: TaskEvent[] }

function snapshotFromRoster(entry: RosterEntry, battery: number): RobotSnapshot {
  return {
    robotId: entry.robot_id,
    type: entry.robot_type,
    x: entry.start.x,
    y: entry.start.y,
    status: 'idle',
    battery,
    t: 0,
    lastUpdateT: 0,
    trail: [{ x: entry.start.x, y: entry.start.y }],
    history: [{ t: 0, battery, status: 'idle' }],
    distance: 0,
  }
}

export function initFleetState(
  roster: RosterEntry[],
  battery?: Record<string, number>,
): FleetState {
  const robots: Record<string, RobotSnapshot> = {}
  for (const entry of roster) {
    robots[entry.robot_id] = snapshotFromRoster(entry, battery?.[entry.robot_id] ?? 100)
  }
  const order = roster.map((r) => r.robot_id)
  return {
    clock: 0,
    robots,
    order,
    series: [computeTrendSample(order.map((id) => robots[id]), 0)],
    taskEvents: [],
  }
}

function pushCapped<T>(arr: T[], item: T, cap: number): T[] {
  const next = arr.length >= cap ? arr.slice(arr.length - cap + 1) : arr.slice()
  next.push(item)
  return next
}

function applyEvent(prev: RobotSnapshot, ev: RobotEvent): RobotSnapshot {
  const moved = Math.hypot(ev.x - prev.x, ev.y - prev.y)
  return {
    ...prev,
    x: ev.x,
    y: ev.y,
    status: ev.status,
    battery: ev.battery,
    t: ev.t,
    lastUpdateT: ev.t,
    trail: pushCapped(prev.trail, { x: ev.x, y: ev.y }, TRAIL_CAP),
    history: pushCapped(
      prev.history,
      { t: ev.t, battery: ev.battery, status: ev.status },
      HISTORY_CAP,
    ),
    // guard against out-of-order / duplicate samples inflating the odometer
    distance: prev.distance + (ev.t >= prev.t ? moved : 0),
  }
}

export function fleetReducer(state: FleetState, action: FleetAction): FleetState {
  switch (action.type) {
    case 'RESET':
      return initFleetState(action.roster, action.battery)

    case 'APPLY_TICK': {
      if (action.events.length === 0 && !action.taskEvents?.length) {
        // still advance the clock so staleness / the trend x-axis keep moving
        if (action.t === state.clock) return state
        const sample = computeTrendSample(
          state.order.map((id) => state.robots[id]),
          action.t,
        )
        return {
          ...state,
          clock: action.t,
          series: pushCapped(state.series, sample, SERIES_CAP),
        }
      }

      const robots = { ...state.robots }
      for (const ev of action.events) {
        const prev = robots[ev.robot_id]
        if (!prev) continue // ignore events for robots not in the roster
        robots[ev.robot_id] = applyEvent(prev, ev)
      }

      const clock = Math.max(state.clock, action.t)
      const sample = computeTrendSample(
        state.order.map((id) => robots[id]),
        clock,
      )

      let taskEvents = state.taskEvents
      if (action.taskEvents?.length) {
        taskEvents = [...action.taskEvents, ...state.taskEvents].slice(0, TASK_EVENT_CAP)
      }

      return {
        clock,
        robots,
        order: state.order,
        series: pushCapped(state.series, sample, SERIES_CAP),
        taskEvents,
      }
    }

    default:
      return state
  }
}
