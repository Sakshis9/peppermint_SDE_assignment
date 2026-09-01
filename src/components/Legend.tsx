import { STATUS_COLOR, STATUS_LABEL } from '../domain/status'
import { STATUSES } from '../domain/types'

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      {STATUSES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
          {STATUS_LABEL[s]}
        </span>
      ))}
      <span className="ml-auto inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-red-500" />
        needs attention
      </span>
      <span className="text-slate-400">P picker · H hauler</span>
    </div>
  )
}
