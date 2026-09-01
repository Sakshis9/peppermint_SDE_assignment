// The site and all eight robots in one SVG whose viewBox is the image's own
// pixel space (900x560), so robot coordinates need no conversion. The wrapper
// keeps the image aspect ratio and scales to fit; marker sizes are given in
// viewBox units but tuned to stay legible at the sizes this panel takes.

import { useMemo } from 'react'
import { STATUS_COLOR } from '../domain/status'
import type { RobotSnapshot } from '../domain/types'
import { useRobotRows, useSelection } from '../state/useFleet'
import { Legend } from './Legend'

const BASE = import.meta.env.BASE_URL
const VIEW_W = 900
const VIEW_H = 560
// a little bleed around the image so robot id/battery labels near the edges
// are not clipped by the panel
const PAD_X = 26
const PAD_TOP = 22
const PAD_BOTTOM = 30

export function MapView() {
  const rows = useRobotRows()
  const { selectedId, select } = useSelection()

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
        <svg
          viewBox={`${-PAD_X} ${-PAD_TOP} ${VIEW_W + PAD_X * 2} ${VIEW_H + PAD_TOP + PAD_BOTTOM}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Site map with robot positions"
        >
          <image
            href={`${BASE}data/layout.png`}
            x={0}
            y={0}
            width={VIEW_W}
            height={VIEW_H}
            preserveAspectRatio="xMidYMid slice"
          />
          <g>
            {rows.map((r) => (
              <Trail key={`trail-${r.robotId}`} robot={r} dim={selectedId != null && selectedId !== r.robotId} />
            ))}
          </g>
          <g>
            {rows.map((r) => (
              <Marker
                key={r.robotId}
                robot={r}
                selected={selectedId === r.robotId}
                dim={selectedId != null && selectedId !== r.robotId}
                attention={r.needsAttention}
                onSelect={() => select(selectedId === r.robotId ? null : r.robotId)}
              />
            ))}
          </g>
        </svg>
      </div>
      <Legend />
    </div>
  )
}

function Trail({ robot, dim }: { robot: RobotSnapshot; dim: boolean }) {
  const points = useMemo(
    () => robot.trail.map((p) => `${p.x},${p.y}`).join(' '),
    [robot.trail],
  )
  if (robot.trail.length < 2) return null
  return (
    <polyline
      points={points}
      fill="none"
      stroke={STATUS_COLOR[robot.status]}
      strokeWidth={2.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity={dim ? 0.12 : 0.35}
      vectorEffect="non-scaling-stroke"
    />
  )
}

interface MarkerProps {
  robot: RobotSnapshot
  selected: boolean
  dim: boolean
  attention: boolean
  onSelect: () => void
}

function Marker({ robot, selected, dim, attention, onSelect }: MarkerProps) {
  const color = STATUS_COLOR[robot.status]
  const r = 11
  const glyph = robot.type === 'picker' ? 'P' : 'H'

  return (
    <g
      transform={`translate(${robot.x} ${robot.y})`}
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
      opacity={dim ? 0.55 : 1}
    >
      {selected && <circle className="fleet-pulse" r={12} fill={color} />}
      {attention && !selected && (
        <circle r={r + 4} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="3 3" />
      )}
      <circle r={r} fill={color} stroke="#fff" strokeWidth={2.5} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={700}
        fill="#fff"
      >
        {glyph}
      </text>
      <text
        x={0}
        y={r + 13}
        textAnchor="middle"
        fontSize={11}
        fontWeight={selected ? 700 : 500}
        fill="#0f172a"
        stroke="#fff"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {robot.robotId} · {Math.round(robot.battery)}%
      </text>
    </g>
  )
}
