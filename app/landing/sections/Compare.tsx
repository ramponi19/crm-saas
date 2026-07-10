'use client'

/**
 * Compare — o comparativo honesto (Nexus × planilha × CRM genérico),
 * com a coluna Nexus destacada em cobalto.
 */

import { Check, Minus, X } from 'lucide-react'
import { COMPARE, type CompareVal } from '../data'
import { useReveal } from '../hooks/useReveal'

export default function Compare() {
  const rootRef = useReveal<HTMLElement>()

  return (
    <section ref={rootRef} className="border-t border-line-soft bg-card py-28 text-ink">
      <div className="mx-auto max-w-[1120px] px-5 sm:px-6">
        <div data-rise className="mb-12 max-w-[600px]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent">Comparativo honesto</div>
          <h2 className="mt-4 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.04] tracking-[-0.04em]">
            Onde o Nexus faz diferença — e onde não precisa.
          </h2>
        </div>

        <div className="overflow-x-auto" data-rise>
          <table className="w-full min-w-[580px] border-collapse text-[14.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className="py-4 pr-4 text-left font-medium text-ink-3"> </th>
                <th className="w-[150px] rounded-t-[10px] bg-accent-soft py-4 text-center text-[14.5px] font-extrabold text-accent">Nexus</th>
                <th className="w-[150px] py-4 text-center font-medium text-ink-2">Planilha</th>
                <th className="w-[150px] py-4 text-center font-medium text-ink-2">CRM genérico</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row, i) => (
                <tr key={row.label} className="border-b border-line-soft">
                  <td className="py-4 pr-4 font-medium text-ink-2">{row.label}</td>
                  <td className={'bg-accent-soft py-4 text-center ' + (i === COMPARE.length - 1 ? 'rounded-b-[10px]' : '')}>
                    <Mark v={row.nexus} accent />
                  </td>
                  <td className="py-4 text-center"><Mark v={row.planilha} /></td>
                  <td className="py-4 text-center"><Mark v={row.generico} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function Mark({ v, accent }: { v: CompareVal; accent?: boolean }) {
  if (v === 'meio') return <Minus size={16} className="mx-auto text-warn" aria-label="parcial" />
  if (v) return <Check size={18} strokeWidth={2.6} className={'mx-auto ' + (accent ? 'text-accent' : 'text-ok')} aria-label="sim" />
  return <X size={16} className="mx-auto text-ink-3" aria-label="não" />
}
