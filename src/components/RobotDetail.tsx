// Everything an operator needs to decide what to do next about one robot:
// where it is, how its battery and status have moved, and any recent task
// events. "Locate on map" just selects it, which makes its marker pulse.

import { useMemo } from 'react'
import { STATUS_COLOR, STATUS_LABEL, attention } from '../domain/status'
import { useClock, useRobot, useSelection, useTaskEvents } from '../state/useFleet'
import { ago, mmss } from '../lib/format'
import { Sparkline } from './Sparkline'
import { StatusPill } from './StatusPill'

export function RobotDetail() {
  const { selectedId } = useSelection()
  const robot = useRobot(selectedId)
  const clock = useClock()
  const taskEvents = useTaskEvents()

  const batterySeries = useMemo(
    () => (robot ? robot.history.map((h) => h.battery) : []),
    [robot],
  )
  const robotTasks = useMemo(
    () => (robot ? taskEvents.filter((e) => e.robotId === robot.robotId).slice(0, 6) : []),
    [robot, taskEvents],
  )

  if (!robot) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-400">
        Select a robot on the map or in the list to see detail.
      </div>
    )
  }

  const a = attention(robot, clock)

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-base font-semibold text-slate-900">{robot.robotId}</span>
        <span className="text-xs text-slate-400">{robot.type}</span>
        <StatusPill status={robot.status} />
      </div>

      {a.needsAttention && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          Needs attention — {a.reasons.join('; ')}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Row label="Battery" value={`${robot.battery.toFixed(1)}%`} />
        <Row label="Position" value={`${robot.x.toFixed(0)}, ${robot.y.toFixed(0)}`} />
        <Row label="Last update" value={ago(clock - robot.lastUpdateT)} />
        <Row label="Distance travelled" value={`${Math.round(robot.distance)} u`} />
      </dl>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Battery over the window</div>
        <Sparkline values={batterySeries} stroke="#0ea5e9" fill="rgba(14,165,233,0.12)" />
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Status timeline</div>
        <StatusTimeline
          history={robot.history}
          clock={robot.history.length ? robot.history[robot.history.length - 1].t : clock}
        />
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Recent task events</div>
        {robotTasks.length === 0 ? (
          <div className="text-xs text-slate-400">none in the window</div>
        ) : (
          <ul className="space-y-0.5 text-xs text-slate-600">
            {robotTasks.map((e, i) => (
              <li key={i} className="tabular-nums">
                {mmss(e.t)} — {e.kind.replace('_', ' ')}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-slate-900">{value}</dd>
    </>
  )
}

function StatusTimeline({
  history,
  clock,
}: {
  history: Array<{ t: number; status: string }>
  clock: number
}) {
  if (history.length < 2) {
    return <div className="text-xs text-slate-400">not enough history yet</div>
  }
  const t0 = history[0].t
  const span = Math.max(1, clock - t0)
  return (
    <div className="flex h-4 w-full overflow-hidden rounded bg-slate-100">
      {history.slice(0, -1).map((h, i) => {
        const next = history[i + 1]
        const w = ((next.t - h.t) / span) * 100
        return (
          <div
            key={i}
            title={`${STATUS_LABEL[h.status as keyof typeof STATUS_LABEL] ?? h.status} @ ${mmss(h.t)}`}
            style={{
              width: `${w}%`,
              background: STATUS_COLOR[h.status as keyof typeof STATUS_COLOR] ?? '#cbd5e1',
            }}
          />
        )
      })}
    </div>
  )
}
