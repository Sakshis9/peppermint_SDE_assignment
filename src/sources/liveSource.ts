// A synthetic live feed. Replaying the recorded file again does not count, so
// this generates genuinely new events for the same eight robots: continuous
// motion between waypoints, gradual battery drift, and a small status state
// machine. Everything routes through a seeded PRNG (prng.ts) so a given seed
// always produces the same stream — that is what makes it testable.
//
// Rate: each robot emits once every EMIT_INTERVAL sim-seconds, so the fleet
// produces ~4 events/s at 1x. The speed multiplier scales sim-time per real
// second, so higher speeds just emit the same series faster.

import type { RobotEvent, RobotType, RosterEntry, Status, TaskEvent } from '../domain/types'
import { mulberry32, type Rng } from './prng'
import type { FleetSource, Tick, TickListener } from './types'

const WORLD = { w: 900, h: 560 }
const MARGIN = 12
const EMIT_INTERVAL = 2 // sim-seconds between a robot's events
const ARRIVE_RADIUS = 14 // px: close enough to count as "at the waypoint"
const CHARGE_TARGET = 90 // leave the charger at this %
const LOW_BATTERY = 15 // at/below this a robot docks to charge

// Open-floor waypoints, chosen to sit in the aisles between the shelves visible
// in layout.png rather than inside them.
const WAYPOINTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 60, y: 30 },
  { x: 430, y: 25 },
  { x: 620, y: 30 },
  { x: 860, y: 30 },
  { x: 100, y: 180 },
  { x: 430, y: 200 },
  { x: 600, y: 250 },
  { x: 880, y: 260 },
  { x: 90, y: 470 },
  { x: 430, y: 500 },
  { x: 620, y: 470 },
  { x: 860, y: 500 },
]

const CHARGERS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 20, y: 540 },
  { x: 880, y: 20 },
]

// px/sec ground speed by robot type; haulers move faster than pickers.
const SPEED: Record<RobotType, number> = { picker: 9, hauler: 15 }

// battery %/sec by status: work drains, charging fills, everything else idles down slowly.
const BATTERY_RATE: Record<Status, number> = {
  on_mission: -0.14,
  active: -0.09,
  blocked: -0.05,
  error: -0.04,
  idle: -0.02,
  maintenance: -0.02,
  offline: -0.01,
  charging: +0.55,
}

// Allowed status transitions. `charging` is reachable from anywhere (a robot can
// always choose to dock), and staying in the same status is always allowed.
const ALLOWED: Record<Status, Status[]> = {
  idle: ['active', 'charging', 'offline', 'maintenance'],
  active: ['on_mission', 'idle', 'blocked', 'error', 'charging', 'offline'],
  on_mission: ['active', 'idle', 'blocked', 'error', 'charging', 'offline'],
  charging: ['idle'],
  blocked: ['active', 'on_mission', 'error', 'idle', 'charging'],
  error: ['maintenance', 'idle', 'charging'],
  maintenance: ['idle', 'charging'],
  offline: ['idle'],
}

export function isAllowedTransition(from: Status, to: Status): boolean {
  return from === to || to === 'charging' || ALLOWED[from].includes(to)
}

interface RobotSim {
  id: string
  type: RobotType
  x: number
  y: number
  battery: number
  status: Status
  target: { x: number; y: number }
  nextEmitT: number
  lastEmitT: number
  onMission: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)

export interface LiveOptions {
  seed?: number
  /** default playback multiplier */
  speed?: number
}

export function createLiveSource(
  roster: RosterEntry[],
  options: LiveOptions = {},
): FleetSource & { _advanceBy(simSeconds: number): void; _prime(): void } {
  const rng: Rng = mulberry32(options.seed ?? 20260901)
  let speed = options.speed ?? 15
  let simClock = 0
  let running = false
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<TickListener>()
  const emit = (tick: Tick) => listeners.forEach((l) => l(tick))

  const robots: RobotSim[] = roster.map((r, i) => ({
    id: r.robot_id,
    type: r.robot_type,
    x: r.start.x,
    y: r.start.y,
    battery: rng.range(45, 100),
    status: 'idle',
    target: rng.pick(WAYPOINTS),
    // stagger first emissions so ticks are spread out, not all-at-once
    nextEmitT: EMIT_INTERVAL * ((i + 1) / roster.length),
    lastEmitT: 0,
    onMission: false,
  }))

  function nearestCharger(s: RobotSim) {
    return [...CHARGERS].sort(
      (a, b) => dist(s.x, s.y, a.x, a.y) - dist(s.x, s.y, b.x, b.y),
    )[0]
  }

  function nextStatus(s: RobotSim): Status {
    // hard gates first
    if (s.status === 'charging') {
      return s.battery >= CHARGE_TARGET ? 'idle' : 'charging'
    }
    if (s.battery <= LOW_BATTERY) return 'charging'

    // otherwise a weighted wander over the allowed edges
    const roll = rng.next()
    switch (s.status) {
      case 'idle':
        if (roll < 0.55) return 'active'
        if (roll < 0.6) return 'maintenance'
        if (roll < 0.62) return 'offline'
        return 'idle'
      case 'active':
        if (roll < 0.4) return 'on_mission'
        if (roll < 0.55) return 'idle'
        if (roll < 0.6) return 'blocked'
        if (roll < 0.63) return 'error'
        return 'active'
      case 'on_mission':
        if (roll < 0.25) return 'active'
        if (roll < 0.32) return 'idle'
        if (roll < 0.38) return 'blocked'
        if (roll < 0.4) return 'error'
        return 'on_mission'
      case 'blocked':
        if (roll < 0.6) return 'active'
        if (roll < 0.7) return 'error'
        return 'blocked'
      case 'error':
        if (roll < 0.5) return 'maintenance'
        if (roll < 0.7) return 'idle'
        return 'error'
      case 'maintenance':
        return roll < 0.4 ? 'idle' : 'maintenance'
      case 'offline':
        return roll < 0.5 ? 'idle' : 'offline'
      default:
        return s.status
    }
  }

  /** Integrate one robot forward by `dt` sim-seconds and return its new event. */
  function stepRobot(s: RobotSim, now: number): { ev: RobotEvent; task?: TaskEvent } {
    const dt = Math.max(0, now - s.lastEmitT)

    // status first — the low-battery gate reads the battery at the start of the
    // interval, which is the reading the robot would actually be acting on
    const prev = s.status
    s.status = nextStatus(s)
    if (s.status === 'charging' && prev !== 'charging') s.target = nearestCharger(s)

    // battery, integrated under the status now in effect, so an event whose
    // battery went up is always a `charging` event
    s.battery = clamp(s.battery + BATTERY_RATE[s.status] * dt, 0, 100)

    // task events on mission entry / exit
    let task: TaskEvent | undefined
    if (s.status === 'on_mission' && !s.onMission) {
      s.onMission = true
      task = { t: now, robotId: s.id, kind: 'task_started' }
    } else if (s.status !== 'on_mission' && s.onMission) {
      s.onMission = false
      task = { t: now, robotId: s.id, kind: 'task_completed' }
    }

    // movement — offline / maintenance robots hold position
    const mobile = s.status !== 'offline' && s.status !== 'maintenance'
    if (mobile) {
      const reach = SPEED[s.type] * dt
      const d = dist(s.x, s.y, s.target.x, s.target.y)
      if (d <= ARRIVE_RADIUS || d === 0) {
        // arrived: pick the next destination
        s.target =
          s.status === 'charging' ? nearestCharger(s) : rng.pick(WAYPOINTS)
      } else {
        const ux = (s.target.x - s.x) / d
        const uy = (s.target.y - s.y) / d
        const jitter = () => rng.range(-1, 1) * Math.min(reach * 0.15, 3)
        s.x = clamp(s.x + ux * Math.min(reach, d) + jitter(), MARGIN, WORLD.w - MARGIN)
        s.y = clamp(s.y + uy * Math.min(reach, d) + jitter(), MARGIN, WORLD.h - MARGIN)
      }
    }

    s.lastEmitT = now
    s.nextEmitT = now + EMIT_INTERVAL

    const ev: RobotEvent = {
      t: Math.round(now * 10) / 10,
      robot_id: s.id,
      x: Math.round(s.x * 10) / 10,
      y: Math.round(s.y * 10) / 10,
      status: s.status,
      battery: Math.round(s.battery * 10) / 10,
    }
    if (task) ev.task_event = task.kind
    return { ev, task }
  }

  function advanceSim(simDelta: number) {
    simClock += simDelta
    const events: RobotEvent[] = []
    const taskEvents: TaskEvent[] = []
    // process every robot that has come due; keep roster order for determinism
    for (const s of robots) {
      let guard = 0
      while (s.nextEmitT <= simClock && guard < 64) {
        const { ev, task } = stepRobot(s, s.nextEmitT)
        events.push(ev)
        if (task) taskEvents.push(task)
        guard += 1
      }
    }
    emit({
      t: Math.round(simClock * 10) / 10,
      events,
      taskEvents: taskEvents.length ? taskEvents : undefined,
    })
  }

  /** Emit an immediate snapshot of every robot's starting state. */
  function prime() {
    const events: RobotEvent[] = robots.map((s) => ({
      t: 0,
      robot_id: s.id,
      x: Math.round(s.x * 10) / 10,
      y: Math.round(s.y * 10) / 10,
      status: s.status,
      battery: Math.round(s.battery * 10) / 10,
    }))
    emit({ t: 0, events })
  }

  const REAL_INTERVAL_MS = 250

  return {
    kind: 'live',
    duration: undefined,

    start() {
      if (running) return
      running = true
      prime()
      if (typeof setInterval === 'function') {
        timer = setInterval(() => {
          advanceSim((REAL_INTERVAL_MS / 1000) * speed)
        }, REAL_INTERVAL_MS)
      }
    },

    pause() {
      running = false
      if (timer != null) clearInterval(timer)
      timer = null
    },

    setSpeed(multiplier: number) {
      speed = Math.max(0.1, multiplier)
    },

    onTick(listener: TickListener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    dispose() {
      this.pause()
      listeners.clear()
    },

    _advanceBy: advanceSim,
    _prime: prime,
  }
}
