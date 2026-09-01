// Replays events.jsonl against a wall clock. The animation loop advances a
// sim-clock by (realElapsed * speed) each frame and releases every event whose
// `t` has come due, batched into one Tick. Seeking rebuilds state by replaying
// silently from the start (the whole window is only ~1450 events).

import type { RobotEvent, TaskEvent } from '../domain/types'
import type { FleetSource, Tick, TickListener } from './types'

export interface ReplayOptions {
  /** default playback multiplier */
  speed?: number
  /** loop back to the start when the end is reached */
  loop?: boolean
}

export interface ReplaySource extends FleetSource {
  /** test hook: advance the wall clock by `realSeconds` without an animation frame */
  _advanceBy(realSeconds: number): void
}

export function createReplaySource(
  events: RobotEvent[],
  options: ReplayOptions = {},
): ReplaySource {
  const sorted = [...events].sort((a, b) => a.t - b.t || a.robot_id.localeCompare(b.robot_id))
  const duration = sorted.length ? sorted[sorted.length - 1].t : 0

  let speed = options.speed ?? 15
  const loop = options.loop ?? true
  let cursor = 0
  let simClock = 0
  let running = false
  let rafId: number | null = null
  let lastFrame = 0
  const listeners = new Set<TickListener>()

  const emit = (tick: Tick) => listeners.forEach((l) => l(tick))

  const splitTaskEvents = (batch: RobotEvent[]): TaskEvent[] | undefined => {
    const te = batch
      .filter((e) => e.task_event)
      .map((e) => ({ t: e.t, robotId: e.robot_id, kind: e.task_event! }))
    return te.length ? te : undefined
  }

  /** Advance the sim-clock by `realSeconds` of wall time and emit any due events. */
  const advanceBy = (realSeconds: number) => {
    if (cursor >= sorted.length) {
      if (loop) reset(0)
      else return
    }
    simClock += realSeconds * speed
    const batch: RobotEvent[] = []
    while (cursor < sorted.length && sorted[cursor].t <= simClock) {
      batch.push(sorted[cursor])
      cursor += 1
    }
    if (batch.length) {
      emit({ t: Math.min(simClock, duration), events: batch, taskEvents: splitTaskEvents(batch) })
    } else {
      emit({ t: Math.min(simClock, duration), events: [] })
    }
  }

  const frame = (now: number) => {
    if (!running) return
    const dt = Math.min((now - lastFrame) / 1000, 0.25) // clamp long pauses / tab-away
    lastFrame = now
    advanceBy(dt)
    rafId = requestAnimationFrame(frame)
  }

  const reset = (toClock: number) => {
    cursor = 0
    simClock = toClock
    // fast-forward the cursor past everything already due, without emitting
    while (cursor < sorted.length && sorted[cursor].t <= toClock) cursor += 1
  }

  /** Latest sample per robot at or before `t` — one batch that rebuilds state. */
  const stateAt = (t: number): RobotEvent[] => {
    const latest = new Map<string, RobotEvent>()
    for (const e of sorted) {
      if (e.t > t) break
      latest.set(e.robot_id, e)
    }
    return [...latest.values()]
  }

  return {
    kind: 'replay',
    duration,

    start() {
      if (running) return
      running = true
      if (typeof requestAnimationFrame === 'function') {
        lastFrame = performance.now()
        rafId = requestAnimationFrame(frame)
      }
    },

    pause() {
      running = false
      if (rafId != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId)
      }
      rafId = null
    },

    setSpeed(multiplier: number) {
      speed = Math.max(0.1, multiplier)
    },

    seek(t: number) {
      const target = Math.max(0, Math.min(t, duration))
      reset(target)
      emit({ t: target, events: stateAt(target) })
    },

    onTick(listener: TickListener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    dispose() {
      this.pause()
      listeners.clear()
    },

    _advanceBy: advanceBy,
  }
}
