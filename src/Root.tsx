// Loads the roster + recorded log once, then hands them to the provider. Keeps
// async loading state out of the rest of the tree.

import { useEffect, useState } from 'react'
import { App } from './App'
import { loadEvents, loadRoster } from './data/load'
import type { RobotEvent, RosterEntry } from './domain/types'
import { FleetProvider } from './state/FleetProvider'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; roster: RosterEntry[]; events: RobotEvent[] }

export function Root() {
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    Promise.all([loadRoster(), loadEvents()])
      .then(([roster, events]) => {
        if (!cancelled) setLoad({ phase: 'ready', roster, events })
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoad({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (load.phase === 'loading') {
    return (
      <div className="grid h-full place-items-center text-slate-500">Loading fleet data…</div>
    )
  }
  if (load.phase === 'error') {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-red-600">
        Could not load fleet data: {load.message}
      </div>
    )
  }

  return (
    <FleetProvider roster={load.roster} events={load.events}>
      <App />
    </FleetProvider>
  )
}
