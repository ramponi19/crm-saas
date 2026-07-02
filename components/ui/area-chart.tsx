'use client'

import { formatCurrency } from '@/lib/utils'

interface MonthData {
  mes: string  // 'YYYY-MM'
  total: number
}

interface AreaChartProps {
  data: MonthData[]
}

// Gera os últimos 12 meses com labels PT-BR
function buildMonths(): { key: string; label: string }[] {
  const months = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('pt-BR', { month: 'short' })
      .toUpperCase().replace('.', '')
    months.push({ key, label })
  }
  return months
}

export function AreaChart({ data }: AreaChartProps) {
  const months = buildMonths()

  // Mapeia dados reais nos 12 meses (zero onde não há venda)
  const dataMap = Object.fromEntries(data.map(d => [d.mes, d.total]))
  const values = months.map(m => dataMap[m.key] ?? 0)

  const W = 720, H = 220
  const pl = 10, pr = 10, pt = 18, pb = 30
  const iw = W - pl - pr
  const ih = H - pt - pb

  const maxVal = Math.max(...values, 1)
  const minVal = 0

  const X = (i: number) => pl + (i / (values.length - 1)) * iw
  const Y = (v: number) => pt + (1 - (v - minVal) / (maxVal - minVal)) * ih

  // Linha SVG
  let linePath = ''
  values.forEach((v, i) => {
    linePath += (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' '
  })

  // Área preenchida
  const areaPath = linePath +
    'L' + X(values.length - 1).toFixed(1) + ' ' + (pt + ih) +
    ' L' + X(0).toFixed(1) + ' ' + (pt + ih) + ' Z'

  // Linhas de grade horizontais
  const gridLines = [0, 1, 2, 3, 4].map(g => {
    const yy = pt + (g / 4) * ih
    return <line key={g} x1={pl} x2={W - pr} y1={yy} y2={yy} stroke="rgba(22,33,46,0.06)" />
  })

  // Labels dos meses
  const labels = months.map((m, i) => (
    <text
      key={i}
      x={X(i)}
      y={H - 9}
      fill="#4F6178"
      fontSize={9.5}
      textAnchor="middle"
      fontFamily="JetBrains Mono, monospace"
      letterSpacing=".5"
    >
      {m.label}
    </text>
  ))

  // Ponto no último valor real
  const lastIdx = values.length - 1
  const lastVal = values[lastIdx]

  // Tooltip no hover do ponto — label com valor
  const tooltipLabel = formatCurrency(lastVal)

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9A24B" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#C9A24B" stopOpacity={0} />
          </linearGradient>
        </defs>
        {gridLines}
        <path d={areaPath} fill="url(#ag)" />
        <path
          d={linePath}
          fill="none"
          stroke="#16212E"
          strokeWidth={2.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Ponto no último mês */}
        <circle
          cx={X(lastIdx)}
          cy={Y(lastVal)}
          r={5}
          fill="#C9A24B"
          stroke="#FFFFFF"
          strokeWidth={2.5}
        />
        {/* Tooltip acima do ponto */}
        <text
          x={X(lastIdx)}
          y={Y(lastVal) - 12}
          fill="#16212E"
          fontSize={10}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="600"
        >
          {tooltipLabel}
        </text>
        {labels}
      </svg>
    </div>
  )
}
