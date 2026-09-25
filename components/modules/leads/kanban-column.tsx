'use client'

import { useLayoutEffect, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Lead, Usuario, KanbanColumn as KanbanColumnType } from './types'
import { LeadCard } from './lead-card'

interface KanbanColumnProps {
  column: KanbanColumnType
  leads: Lead[]
  usuarios: Usuario[]
  isDragging: boolean
  onLeadClick: (lead: Lead) => void
  sla?: { verde: number; amarelo: number; vermelho: number }
}

const fmtK = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace('.', ',')} mil` : `R$ ${v}`

export function KanbanColumn({ column, leads, usuarios, isDragging, onLeadClick, sla }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}`, data: { status: column.id } })

  /**
   * A COLUNA NAO PERDE O LUGAR QUANDO UM CARD SOBE.
   *
   * ══ O QUE ACONTECIA (25/09/2026) ═══════════════════════════════════════════
   *
   * Quem estava lendo cards antigos, la embaixo, e respondia um cliente era
   * jogado de volta ao topo. O card subir e o certo — o dono confirmou —, mas a
   * COLUNA ia junto, e voltar ao ponto de leitura exigia rolar centenas de cards.
   *
   * ══ POR QUE ════════════════════════════════════════════════════════════════
   *
   * Nao e codigo nosso rolando. Medido em producao: no instante da reordenacao o
   * scroll vai a zero sem NENHUMA chamada de `scrollTop`, `scrollTo` ou
   * `scrollIntoView` — o unico evento registrado e o do proprio navegador.
   * Ao reordenar, o React tira e repoe nos dentro deste container; enquanto eles
   * estao fora, a altura rolavel cai abaixo da posicao atual e o navegador apara
   * o scroll. Os nos voltam, a altura volta, a posicao nao.
   *
   * Os nos sao MOVIDOS, nao recriados (marquei-os no DOM e sobreviveram), e
   * mesmo assim a posicao se perde — por isso nao adianta mexer nas keys.
   *
   * ══ A CORRECAO ═════════════════════════════════════════════════════════════
   *
   * Guardar onde a PESSOA deixou a rolagem e repor depois do commit e antes da
   * pintura (`useLayoutEffect`), para nao existir um quadro intermediario no
   * topo.
   *
   * A margem de 4px separa o que o navegador aparou do que a pessoa rolou: sem
   * ela, a reposicao brigaria com a rolagem do proprio usuario.
   */
  const caixaRef = useRef<HTMLDivElement | null>(null)
  const ondeParei = useRef(0)

  useLayoutEffect(() => {
    const el = caixaRef.current
    if (!el) return
    if (ondeParei.current > 0 && Math.abs(el.scrollTop - ondeParei.current) > 4) {
      el.scrollTop = ondeParei.current
    }
  }, [leads])

  const soma = column.tipo === 'negociacao'
    ? leads.reduce((s, l) => s + (l.valor_estimado ?? 0), 0)
    : 0

  const emptyMsg =
    column.tipo === 'ganho' ? 'Vendas fechadas aparecem aqui.' :
    column.tipo === 'perdido' ? 'Nada perdido — bom sinal.' :
    'Arraste um lead aqui.'

  return (
    <div className="flex h-full w-[84vw] max-w-[300px] flex-none snap-start flex-col sm:w-[228px]">
      {/* Header da coluna: dot quadrado 6px · label · soma · contagem */}
      <div className="flex items-center gap-2 px-1 pb-2.5">
        <span className="h-1.5 w-1.5 flex-none rounded-[2px]" style={{ background: column.color }} />
        <span className="truncate text-[12px] font-semibold text-ink-2">{column.label}</span>
        {soma > 0 && <span className="num ml-1 flex-none text-[10.5px] font-medium text-ink-3">{fmtK(soma)}</span>}
        <span className="num ml-auto flex-none text-[11px] font-semibold text-ink-3">{leads.length}</span>
      </div>

      {/* Drop zone */}
      <div
        ref={(el) => { setNodeRef(el); caixaRef.current = el }}
        onScroll={(e) => { ondeParei.current = e.currentTarget.scrollTop }}
        className={`flex min-h-[90px] flex-1 flex-col gap-2 overflow-y-auto rounded-card p-0.5 transition-colors scrollbar-thin ${
          isOver ? 'bg-accent-soft outline outline-1 outline-dashed outline-accent/40' : ''
        }`}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} usuarios={usuarios} onClick={() => onLeadClick(lead)} barColor={column.color} sla={sla} />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex min-h-[80px] flex-1 items-center justify-center rounded-card border border-dashed border-line px-3 text-center">
            <p className="text-[11.5px] leading-relaxed text-ink-3">{isDragging ? 'Soltar aqui' : emptyMsg}</p>
          </div>
        )}
      </div>
    </div>
  )
}
