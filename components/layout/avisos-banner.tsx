'use client'

import { useLocalStorage } from '@/lib/navegador'
import { Info, TriangleAlert, Sparkles, X } from 'lucide-react'

export type AvisoBanner = {
  id: number
  titulo: string
  corpo: string
  tom: string
}

const STORE_KEY = 'avisos_dispensados'

/** Referência FIXA: array novo a cada render faria o store achar que mudou. */
const VAZIO: number[] = []

const TOM_STYLE: Record<string, { wrap: string; icon: React.ReactNode }> = {
  info: { wrap: 'border-accent/20 bg-accent-soft text-accent', icon: <Info size={15} strokeWidth={1.8} /> },
  alerta: { wrap: 'border-warn/25 bg-warn-soft text-warn', icon: <TriangleAlert size={15} strokeWidth={1.8} /> },
  sucesso: { wrap: 'border-ok/25 bg-ok-soft text-ok', icon: <Sparkles size={15} strokeWidth={1.8} /> },
}

export function AvisosBanner({ avisos }: { avisos: AvisoBanner[] }) {
  /**
   * A lista de dispensados vem do `localStorage` SEM efeito e sem render duplo.
   *
   * Antes eram dois renders em toda montagem: o primeiro com a lista vazia (que
   * mostrava banner já dispensado por um instante), o efeito lia o disco, e o
   * segundo com a lista certa. O `pronto` existia justamente para esconder esse
   * primeiro quadro — e deixou de ser necessário.
   */
  const [dispensados, gravarDispensados] = useLocalStorage<number[]>(STORE_KEY, VAZIO)

  function dispensar(id: number) {
    gravarDispensados([...new Set([...dispensados, id])])
  }

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
