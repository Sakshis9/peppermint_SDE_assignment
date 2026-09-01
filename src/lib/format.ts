export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function ago(seconds: number): string {
  if (seconds < 1) return 'now'
  if (seconds < 60) return `${Math.round(seconds)}s ago`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s ago`
}

export function batteryColor(pct: number): string {
  if (pct <= 20) return '#ef4444'
  if (pct <= 40) return '#f97316'
  return '#22c55e'
}
