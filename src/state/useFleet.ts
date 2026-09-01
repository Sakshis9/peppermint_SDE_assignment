// Small selector hooks over the fleet context, so components subscribe to just
// the slice they render.

import { useMemo } from 'react'
import { summarize } from '../domain/aggregates'
import { attention } from '../domain/status'
import type { RobotId, RobotSnapshot } from '../domain/types'
import { useFleetContext } from './FleetProvider'

export function useTransport() {
  const { transport, play, pause, togglePlay, setSpeed, seek, canSeek } = useFleetContext()
  return { ...transport, play, pause, togglePlay, setSpeed, seek, canSeek }
}

export function useSourceKind() {
  const { sourceKind, setSourceKind } = useFleetContext()
  return [sourceKind, setSourceKind] as const
}

export function useRobots(): RobotSnapshot[] {
  const { state } = useFleetContext()
  return useMemo(() => state.order.map((id) => state.robots[id]), [state.order, state.robots])
}

export function useRobot(id: RobotId | null): RobotSnapshot | null {
  const { state } = useFleetContext()
  return id ? state.robots[id] ?? null : null
}

export function useClock() {
  return useFleetContext().state.clock
}

export function useSeries() {
  return useFleetContext().state.series
}

export function useTaskEvents() {
  return useFleetContext().state.taskEvents
}

export function useSelection() {
  const { selectedId, select } = useFleetContext()
  return { selectedId, select }
}

export function useFleetSummary() {
  const robots = useRobots()
  const clock = useClock()
  return useMemo(() => summarize(robots, clock), [robots, clock])
}

export interface RobotRow extends RobotSnapshot {
  needsAttention: boolean
  reasons: string[]
}

export function useRobotRows(): RobotRow[] {
  const robots = useRobots()
  const clock = useClock()
  return useMemo(
    () =>
      robots.map((r) => {
        const a = attention(r, clock)
        return { ...r, needsAttention: a.needsAttention, reasons: a.reasons }
      }),
    [robots, clock],
  )
}
