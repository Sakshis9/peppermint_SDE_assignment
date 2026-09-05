// A FleetSource is anything that can drive the dashboard: it owns a clock, emits
// batches of events, and can be played, paused and sped up. The recorded-log
// replay and the synthetic live feed both implement it, which is what lets one
// set of views serve both (ANSWERS.md Q1).

import type { RobotEvent, TaskEvent } from '../domain/types'

export interface Tick {
  /** sim-time in seconds at the end of this batch */
  t: number
  events: RobotEvent[]
  taskEvents?: TaskEvent[]
  /**
   * True only for the tick emitted by `seek()`. A seek jumps the clock
   * (possibly backward) rather than advancing it, so the consumer must
   * replace state wholesale instead of folding this batch onto whatever it
   * had accumulated for a different point in time — see FleetProvider's
   * handling and the `SEEK` reducer action.
   */
  seeked?: boolean
}

export type TickListener = (tick: Tick) => void

export interface FleetSource {
  readonly kind: 'replay' | 'live'
  /** total sim-time span if known (replay); undefined for the open-ended live feed */
  readonly duration?: number
  start(): void
  pause(): void
  /** playback rate multiplier relative to real time */
  setSpeed(multiplier: number): void
  /** jump to a sim-time (replay only); no-op if unsupported */
  seek?(t: number): void
  /** subscribe to ticks; returns an unsubscribe fn */
  onTick(listener: TickListener): () => void
  /** stop timers and release resources */
  dispose(): void
}
