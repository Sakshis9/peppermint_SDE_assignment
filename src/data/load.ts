// Loads the three provided data files at runtime from /public/data. Kept out of
// the bundle so the same build can point at a different log later.

import type { RobotEvent, RosterEntry } from '../domain/types'

const base = import.meta.env.BASE_URL

export async function loadRoster(): Promise<RosterEntry[]> {
  const res = await fetch(`${base}data/robots.json`)
  if (!res.ok) throw new Error(`robots.json: ${res.status}`)
  return (await res.json()) as RosterEntry[]
}

export async function loadEvents(): Promise<RobotEvent[]> {
  const res = await fetch(`${base}data/events.jsonl`)
  if (!res.ok) throw new Error(`events.jsonl: ${res.status}`)
  const text = await res.text()
  return parseEventsJsonl(text)
}

export function parseEventsJsonl(text: string): RobotEvent[] {
  const out: RobotEvent[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    out.push(JSON.parse(trimmed) as RobotEvent)
  }
  out.sort((a, b) => a.t - b.t)
  return out
}
