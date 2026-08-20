import Link from 'next/link'
import { CircleAlert } from 'lucide-react'
import { Card, Badge } from '@/components/ui'
import { gravidadeDoAtraso } from '@/lib/lead-parado'

/**
 * Leads sem tratativa há tempo demais.
 *
 * O funil mostra tudo o que está aberto, mas não separa o que está andando do
 * que parou — e um lead esquecido dentro de "Em proposta" parece progresso.
 *
 * Vive junto do dashboard da imobiliária: nenhum outro dashboard importa daqui.
 */

export interface LeadParado {
  id: number
  nome: string
  etapa: string
  responsavel: string
  dias: number
}

export function LeadsParados({ leads, limiteDias }: { leads: LeadParado[]; limiteDias: number }) {
  if (leads.length === 0) {
    return (
      <Card title="Leads parados">
        <p className="text-[13px] text-ink-3">
          Nenhum lead parado há mais de {limiteDias} dias. Carteira em dia.
        </p>
      </Card>
    )
  }

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <CircleAlert size={15} strokeWidth={1.8} className="text-warn" />
          Leads parados
          <span className="num rounded-full bg-warn-soft px-1.5 py-0.5 text-[10.5px] font-bold text-warn">
            {leads.length}
          </span>
        </span>
      }
      actions={<Link href="/leads" className="text-[12px] font-semibold text-accent hover:underline">Abrir Leads →</Link>}
      flush
    >
      <div className="divide-y divide-line-soft">
        {leads.map((l) => {
          const p = gravidadeDoAtraso(l.dias)
          return (
            <Link key={l.id} href="/leads" className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{l.nome}</span>
                <span className="block truncate text-[11.5px] text-ink-3">{l.etapa} · {l.responsavel}</span>
              </span>
              <Badge tone={p.tone}>{p.label}</Badge>
              <span className="num w-[64px] shrink-0 text-right text-[11.5px] text-ink-2">{l.dias} dias</span>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
