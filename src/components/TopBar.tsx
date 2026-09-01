import { SPEED_STEPS } from '../state/FleetProvider'
import { useSourceKind, useTransport } from '../state/useFleet'
import { mmss } from '../lib/format'

export function TopBar() {
  const [sourceKind, setSourceKind] = useSourceKind()
  const t = useTransport()

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">Fleet Dashboard</span>
      </div>

      {/* replay / live toggle */}
      <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-sm">
        {(['replay', 'live'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSourceKind(k)}
            className={
              'px-3 py-1 capitalize transition-colors ' +
              (sourceKind === k
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100')
            }
          >
            {k === 'replay' ? 'Replay log' : 'Live feed'}
          </button>
        ))}
      </div>

      {/* transport */}
      <div className="flex items-center gap-2">
        <button
          onClick={t.togglePlay}
          className="rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t.playing ? 'Pause' : 'Play'}
        </button>
        <div className="flex items-center gap-1">
          {SPEED_STEPS.map((s) => (
            <button
              key={s}
              onClick={() => t.setSpeed(s)}
              className={
                'rounded px-2 py-1 text-xs font-medium transition-colors ' +
                (t.speed === s
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
              }
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* scrubber (replay only) */}
      {t.canSeek && t.duration != null && (
        <label className="flex flex-1 items-center gap-2 text-xs text-slate-500">
          <span className="tabular-nums">{mmss(t.clock)}</span>
          <input
            type="range"
            min={0}
            max={t.duration}
            step={1}
            value={Math.min(t.clock, t.duration)}
            onChange={(e) => t.seek(Number(e.target.value))}
            className="flex-1 accent-sky-600"
          />
          <span className="tabular-nums">{mmss(t.duration)}</span>
        </label>
      )}

      {!t.canSeek && (
        <div className="ml-auto text-xs text-slate-500">
          live · sim clock <span className="tabular-nums font-medium text-slate-700">{mmss(t.clock)}</span>
        </div>
      )}
    </header>
  )
}
