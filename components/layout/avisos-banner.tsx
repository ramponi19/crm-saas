'use client'

import { useEffect, useState } from 'react'
import { Info, TriangleAlert, Sparkles, X } from 'lucide-react'

export type AvisoBanner = {
  id: number
  titulo: string
  corpo: string
  tom: string
}

const STORE_KEY = 'avisos_dispensados'

const TOM_STYLE: Record<string, { wrap: string; icon: React.ReactNode }> = {
  info: { wrap: 'border-accent/20 bg-accent-soft text-accent', icon: <Info size={15} strokeWidth={1.8} /> },
  alerta: { wrap: 'border-warn/25 bg-warn-soft text-warn', icon: <TriangleAlert size={15} strokeWidth={1.8} /> },
  sucesso: { wrap: 'border-ok/25 bg-ok-soft text-ok', icon: <Sparkles size={15} strokeWidth={1.8} /> },
}

export function AvisosBanner({ avisos }: { avisos: AvisoBanner[] }) {
  const [dispensados, setDispensados] = useState<number[]>([])
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY)
      setDispensados(raw ? (JSON.parse(raw) as number[]) : [])
    } catch { /* ignore */ }
    setPronto(true)
  }, [])

  function dispensar(id: number) {
    const next = [...new Set([...dispensados, id])]
    setDispensados(next)
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  if (!pronto) return null
  const visiveis = avisos.filter(a => !dispensados.includes(a.id))
  if (visiveis.length === 0) return null

  return (
    <div className="flex flex-col">
      {visiveis.map(a => {
        const s = TOM_STYLE[a.tom] ?? TOM_STYLE.info
        return (
          <div key={a.id} className={`flex items-start gap-2.5 border-b px-4 py-2 text-[12.5px] ${s.wrap}`}>
            <span className="mt-0.5 shrink-0">{s.icon}</span>
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{a.titulo}</span>
              {a.corpo && <span className="font-medium opacity-90"> — {a.corpo}</span>}
            </div>
            <button
              onClick={() => dispensar(a.id)}
              aria-label="Dispensar aviso"
              className="ml-1 shrink-0 rounded-control p-0.5 opacity-70 transition-opacity hover:opacity-100"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
