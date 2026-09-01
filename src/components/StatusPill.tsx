import { STATUS_COLOR, STATUS_LABEL } from '../domain/status'
import type { Status } from '../domain/types'

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${STATUS_COLOR[status]}1f`, color: STATUS_COLOR[status] }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
      />
      {STATUS_LABEL[status]}
    </span>
  )
}
