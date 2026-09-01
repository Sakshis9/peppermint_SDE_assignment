// Current-value readouts. These complement the trend chart (they answer "right
// now"); the challenge is explicit that a single current value is not a trend,
// so the chart below carries the over-time view.

import { useFleetSummary } from '../state/useFleet'

export function StatCards() {
  const s = useFleetSummary()
  const cards: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Robots', value: String(s.total) },
    { label: 'Working', value: String(s.working), tone: 'text-sky-600' },
    { label: 'Charging', value: String(s.charging), tone: 'text-purple-600' },
    {
      label: 'Need attention',
      value: String(s.attention),
      tone: s.attention > 0 ? 'text-red-600' : 'text-slate-900',
    },
    { label: 'Avg battery', value: `${Math.round(s.avgBattery)}%` },
  ]
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">{c.label}</div>
          <div className={`text-lg font-semibold tabular-nums ${c.tone ?? 'text-slate-900'}`}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}
