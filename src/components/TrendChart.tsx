// Hand-rolled SVG, no chart library. Shows how the fleet is trending across the
// observed window rather than a single current value:
//   - a stacked area of Working / Available / Needs-attention as a share of the
//     fleet (the "fraction active over time" the brief asks for), and
//   - an optional average-battery line on a second axis.
// In replay it fills left-to-right as playback advances; in live it shows the
// rolling window kept in state.series.

import { useMemo, useState } from 'react'
import { BUCKET_COLOR } from '../domain/status'
import type { TrendSample } from '../domain/types'
import { useSeries } from '../state/useFleet'
import { mmss } from '../lib/format'

const W = 760
const H = 220
const PAD = { top: 12, right: 44, bottom: 24, left: 36 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

export function TrendChart() {
  const series = useSeries()
  const [showBattery, setShowBattery] = useState(true)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const { t0, t1 } = useMemo(() => {
    if (series.length === 0) return { t0: 0, t1: 1 }
    return { t0: series[0].t, t1: Math.max(series[series.length - 1].t, series[0].t + 1) }
  }, [series])

  const xOf = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * PLOT_W
  const yFrac = (f: number) => PAD.top + (1 - f) * PLOT_H
  const yBatt = (b: number) => PAD.top + (1 - b / 100) * PLOT_H

  // three stacked bands: working (from 0), available (on top), attention (to 1)
  const bands = useMemo(() => {
    const working = band(series, xOf, yFrac, () => 0, (s) => s.workingFrac)
    const available = band(
      series,
      xOf,
      yFrac,
      (s) => s.workingFrac,
      (s) => Math.min(1, s.workingFrac + Math.max(0, 1 - s.workingFrac - s.attentionFrac)),
    )
    const attention = band(
      series,
      xOf,
      yFrac,
      (s) => Math.max(0, 1 - s.attentionFrac),
      () => 1,
    )
    return { working, available, attention }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, t0, t1])

  const batteryLine = useMemo(
    () => series.map((s) => `${xOf(s.t)},${yBatt(s.avgBattery)}`).join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, t0, t1],
  )

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (series.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const t = t0 + ((px - PAD.left) / PLOT_W) * (t1 - t0)
    let lo = 0
    let hi = series.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (series[mid].t < t) lo = mid + 1
      else hi = mid
    }
    setHoverIdx(lo)
  }

  const hover = hoverIdx != null ? series[hoverIdx] : null

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Fleet trend over the window</h2>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={showBattery}
            onChange={(e) => setShowBattery(e.target.checked)}
            className="accent-slate-700"
          />
          avg battery
        </label>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* horizontal gridlines at 25 / 50 / 75 / 100 % */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yFrac(f)}
              y2={yFrac(f)}
              stroke="#e2e8f0"
            />
            <text x={PAD.left - 6} y={yFrac(f)} textAnchor="end" dominantBaseline="central" fontSize={9} fill="#94a3b8">
              {f * 100}
            </text>
          </g>
        ))}

        {/* x ticks */}
        {xTicks(t0, t1).map((t) => (
          <text key={t} x={xOf(t)} y={H - 8} textAnchor="middle" fontSize={9} fill="#94a3b8">
            {mmss(t)}
          </text>
        ))}

        {series.length >= 2 && (
          <>
            <path d={bands.working} fill={BUCKET_COLOR.working} fillOpacity={0.85} />
            <path d={bands.available} fill={BUCKET_COLOR.available} fillOpacity={0.5} />
            <path d={bands.attention} fill={BUCKET_COLOR.attention} fillOpacity={0.8} />
            {showBattery && (
              <polyline
                points={batteryLine}
                fill="none"
                stroke="#0f172a"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
          </>
        )}

        {/* right axis for battery */}
        {showBattery &&
          [0, 50, 100].map((b) => (
            <text
              key={b}
              x={W - PAD.right + 6}
              y={yBatt(b)}
              dominantBaseline="central"
              fontSize={9}
              fill="#64748b"
            >
              {b}%
            </text>
          ))}

        {hover && (
          <g>
            <line
              x1={xOf(hover.t)}
              x2={xOf(hover.t)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="#0f172a"
              strokeOpacity={0.4}
            />
            <circle cx={xOf(hover.t)} cy={yFrac(hover.workingFrac)} r={3} fill={BUCKET_COLOR.working} />
          </g>
        )}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <Key color={BUCKET_COLOR.working} label="Working (active / on mission)" />
        <Key color={BUCKET_COLOR.available} label="Available (idle / charging)" />
        <Key color={BUCKET_COLOR.attention} label="Needs attention" />
        {hover && (
          <span className="ml-auto tabular-nums text-slate-700">
            {mmss(hover.t)} — working {(hover.workingFrac * 100).toFixed(0)}% · attention{' '}
            {(hover.attentionFrac * 100).toFixed(0)}% · battery {hover.avgBattery.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  )
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}

function band(
  series: TrendSample[],
  xOf: (t: number) => number,
  yOf: (f: number) => number,
  lower: (s: TrendSample) => number,
  upper: (s: TrendSample) => number,
): string {
  if (series.length < 2) return ''
  const top = series.map((s) => `${xOf(s.t)},${yOf(upper(s))}`)
  const bottom = [...series].reverse().map((s) => `${xOf(s.t)},${yOf(lower(s))}`)
  return `M${top.join(' L')} L${bottom.join(' L')} Z`
}

function xTicks(t0: number, t1: number): number[] {
  const span = t1 - t0
  const step = span <= 120 ? 30 : span <= 600 ? 120 : span <= 1200 ? 180 : 300
  const ticks: number[] = []
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) ticks.push(t)
  return ticks
}
