// Wires a FleetSource to the fleet reducer and exposes transport + selection
// state to the tree. Swapping between replay and live just means disposing one
// source and building the other; the reducer and every view stay identical.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { fleetReducer, initFleetState } from '../domain/fleetReducer'
import type { FleetState, RobotEvent, RobotId, RosterEntry, TaskEvent } from '../domain/types'
import { createLiveSource } from '../sources/liveSource'
import { createReplaySource } from '../sources/replaySource'
import type { FleetSource, Tick } from '../sources/types'

export type SourceKind = 'replay' | 'live'

export const SPEED_STEPS = [1, 2, 5, 15, 30, 60] as const
export const DEFAULT_SPEED = 15
export const LIVE_SEED = 20260901

interface TransportState {
  playing: boolean
  speed: number
  clock: number
  duration?: number
}

interface FleetContextValue {
  state: FleetState
  roster: RosterEntry[]
  sourceKind: SourceKind
  setSourceKind: (kind: SourceKind) => void
  transport: TransportState
  play: () => void
  pause: () => void
  togglePlay: () => void
  setSpeed: (multiplier: number) => void
  seek: (t: number) => void
  canSeek: boolean
  selectedId: RobotId | null
  select: (id: RobotId | null) => void
}

const FleetContext = createContext<FleetContextValue | null>(null)

interface ProviderProps {
  roster: RosterEntry[]
  events: RobotEvent[]
  children: ReactNode
}

export function FleetProvider({ roster, events, children }: ProviderProps) {
  const [state, dispatch] = useReducer(fleetReducer, roster, (r) => initFleetState(r))
  const [sourceKind, setSourceKindState] = useState<SourceKind>('replay')
  const [transport, setTransport] = useState<TransportState>({
    playing: false,
    speed: DEFAULT_SPEED,
    clock: 0,
    duration: events.length ? events[events.length - 1].t : undefined,
  })
  const [selectedId, setSelectedId] = useState<RobotId | null>(null)

  const sourceRef = useRef<FleetSource | null>(null)
  // ticks are buffered and flushed once per animation frame so a 60x replay
  // still only re-renders React at frame rate
  const bufferRef = useRef<{ t: number; events: RobotEvent[]; taskEvents: TaskEvent[] }>({
    t: 0,
    events: [],
    taskEvents: [],
  })
  const rafRef = useRef<number | null>(null)

  const flush = useCallback(() => {
    rafRef.current = null
    const buf = bufferRef.current
    if (buf.events.length === 0 && buf.taskEvents.length === 0 && buf.t === 0) return
    dispatch({
      type: 'APPLY_TICK',
      t: buf.t,
      events: buf.events,
      taskEvents: buf.taskEvents.length ? buf.taskEvents : undefined,
    })
    setTransport((tr) => (tr.clock === buf.t ? tr : { ...tr, clock: buf.t }))
    bufferRef.current = { t: 0, events: [], taskEvents: [] }
  }, [])

  const onTick = useCallback(
    (tick: Tick) => {
      if (tick.seeked) {
        // a seek replaces state outright (see the SEEK reducer action) —
        // drop anything buffered for the pre-seek position first, or a
        // flush a frame later would clobber the seek with stale data
        if (rafRef.current != null) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        bufferRef.current = { t: 0, events: [], taskEvents: [] }
        dispatch({ type: 'SEEK', roster, t: tick.t, events: tick.events, taskEvents: tick.taskEvents })
        setTransport((tr) => ({ ...tr, clock: tick.t }))
        return
      }
      const buf = bufferRef.current
      buf.t = Math.max(buf.t, tick.t)
      // later events win when the same robot reports twice within one frame
      if (tick.events.length) buf.events.push(...tick.events)
      if (tick.taskEvents?.length) buf.taskEvents.push(...tick.taskEvents)
      if (rafRef.current == null) {
        rafRef.current =
          typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(flush)
            : (setTimeout(flush, 16) as unknown as number)
      }
    },
    [flush, roster],
  )

  // (re)build the source whenever the kind changes
  useEffect(() => {
    dispatch({ type: 'RESET', roster })
    setTransport((tr) => ({ ...tr, clock: 0, playing: true }))
    bufferRef.current = { t: 0, events: [], taskEvents: [] }

    const source: FleetSource =
      sourceKind === 'replay'
        ? createReplaySource(events, { speed: transport.speed })
        : createLiveSource(roster, { seed: LIVE_SEED, speed: transport.speed })

    sourceRef.current = source
    const unsub = source.onTick(onTick)
    source.start()

    return () => {
      unsub()
      source.dispose()
      sourceRef.current = null
      if (rafRef.current != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = null
    }
    // transport.speed intentionally excluded: speed changes go through setSpeed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKind, roster, events, onTick])

  const play = useCallback(() => {
    sourceRef.current?.start()
    setTransport((tr) => ({ ...tr, playing: true }))
  }, [])

  const pause = useCallback(() => {
    sourceRef.current?.pause()
    setTransport((tr) => ({ ...tr, playing: false }))
  }, [])

  const togglePlay = useCallback(() => {
    setTransport((tr) => {
      if (tr.playing) sourceRef.current?.pause()
      else sourceRef.current?.start()
      return { ...tr, playing: !tr.playing }
    })
  }, [])

  const setSpeed = useCallback((multiplier: number) => {
    sourceRef.current?.setSpeed(multiplier)
    setTransport((tr) => ({ ...tr, speed: multiplier }))
  }, [])

  const seek = useCallback((t: number) => {
    // source.seek() emits synchronously, and onTick's `seeked` branch above
    // dispatches SEEK and updates transport.clock before this call returns —
    // no separate setTransport needed here (React 18 batches both together).
    sourceRef.current?.seek?.(t)
  }, [])

  const setSourceKind = useCallback((kind: SourceKind) => {
    setSourceKindState(kind)
    setSelectedId(null)
  }, [])

  const value = useMemo<FleetContextValue>(
    () => ({
      state,
      roster,
      sourceKind,
      setSourceKind,
      transport,
      play,
      pause,
      togglePlay,
      setSpeed,
      seek,
      canSeek: sourceKind === 'replay',
      selectedId,
      select: setSelectedId,
    }),
    [state, roster, sourceKind, setSourceKind, transport, play, pause, togglePlay, setSpeed, seek, selectedId],
  )

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>
}

export function useFleetContext(): FleetContextValue {
  const ctx = useContext(FleetContext)
  if (!ctx) throw new Error('useFleetContext must be used within <FleetProvider>')
  return ctx
}
