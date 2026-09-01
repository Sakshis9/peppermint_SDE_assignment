// Find a specific robot, or the ones that need attention. Search by id/type,
// optional attention-only filter, and a sort that floats problems to the top.

import { useMemo, useState } from 'react'
import { batteryColor } from '../lib/format'
import { ago } from '../lib/format'
import { useClock, useRobotRows, useSelection } from '../state/useFleet'
import { StatusPill } from './StatusPill'

export function RobotList() {
  const rows = useRobotRows()
  const clock = useClock()
  const { selectedId, select } = useSelection()
  const [query, setQuery] = useState('')
  const [attentionOnly, setAttentionOnly] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => (attentionOnly ? r.needsAttention : true))
      .filter(
        (r) =>
          q === '' ||
          r.robotId.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1
        return a.battery - b.battery
      })
  }, [rows, query, attentionOnly])

  const attentionCount = rows.filter((r) => r.needsAttention).length

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find robot (id, type, status)…"
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-sky-500"
        />
        <button
          onClick={() => setAttentionOnly((v) => !v)}
          className={
            'shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors ' +
            (attentionOnly
              ? 'bg-red-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
          }
        >
          Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ''}
        </button>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="p-3 text-sm text-slate-400">No robots match.</li>
        )}
        {filtered.map((r) => (
          <li key={r.robotId}>
            <button
              onClick={() => select(selectedId === r.robotId ? null : r.robotId)}
              className={
                'flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors ' +
                (selectedId === r.robotId ? 'bg-sky-50' : 'hover:bg-slate-50')
              }
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-900">
                  {r.robotId}
                </span>
                <span className="text-xs text-slate-400">{r.type}</span>
                {r.needsAttention && (
                  <span className="ml-auto rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                    attention
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={r.status} />
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-slate-200"
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(2, r.battery)}%`,
                        background: batteryColor(r.battery),
                      }}
                    />
                  </span>
                  <span className="tabular-nums text-xs text-slate-500">
                    {Math.round(r.battery)}%
                  </span>
                </div>
                <span className="ml-auto text-[11px] text-slate-400">
                  {ago(clock - r.lastUpdateT)}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
