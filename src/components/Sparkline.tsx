interface SparklineProps {
  values: number[]
  min?: number
  max?: number
  width?: number
  height?: number
  stroke?: string
  fill?: string
}

export function Sparkline({
  values,
  min = 0,
  max = 100,
  width = 220,
  height = 44,
  stroke = '#0f172a',
  fill = 'rgba(15,23,42,0.08)',
}: SparklineProps) {
  if (values.length < 2) {
    return <div className="text-xs text-slate-400">not enough history yet</div>
  }
  const span = max - min || 1
  const step = width / (values.length - 1)
  const y = (v: number) => height - ((v - min) / span) * height
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`)
  const line = `M${pts.join(' L')}`
  const area = `${line} L${width},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" preserveAspectRatio="none">
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
