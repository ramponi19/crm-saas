import { formatarDataHora, FUSO_PADRAO } from '@/lib/datas'
import { Badge } from '@/components/ui'

/** Uma linha de `alertas_entrada` (migração 20261118000300; lib/alertas-entrada.ts). */
export interface AlertaEntrada {
  id: number
  empresa_id: number
  empresa?: string | null
  canal_id: number | null
  tipo: 'entrada_parada' | 'negocio_nao_criado' | string
  desde: string
  detalhe: string | null
  notificado_em: string | null
  resolvido_em: string | null
}

const ROTULO: Record<string, string> = {
  entrada_parada: 'Entrada parada',
  negocio_nao_criado: 'Negócio não criado',
}

/**
 * Registro dos alertas de recebimento no superadmin: canal que recebe da Meta e não grava há 30 min no
 * horário de atendimento, e negócio que uma regra recusou numa mensagem recebida (a mensagem entrou).
 */
export function AlertasEntrada({ alertas, comEmpresa = false }: { alertas: AlertaEntrada[]; comEmpresa?: boolean }) {
  const quando = (d: string | null) => formatarDataHora(d, undefined, '—', FUSO_PADRAO)
  if (alertas.length === 0) return <p className="text-[12.5px] text-ink-3" data-alertas-entrada="0">Nenhum alerta de recebimento.</p>
  return (
    <ul className="divide-y divide-line-soft rounded-control border border-line text-[12.5px]" data-alertas-entrada={alertas.length}>
      {alertas.map((a) => (
        <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2" data-alerta={a.tipo} data-aberto={a.resolvido_em ? 'nao' : 'sim'}>
          <span className="min-w-0 text-ink">
            <span className="font-medium">{ROTULO[a.tipo] ?? a.tipo}</span>
            {comEmpresa && a.empresa ? <> · {a.empresa}</> : null}
            <span className="text-ink-3"> · desde {quando(a.desde)}</span>
            {a.detalhe && <span className="block text-[11.5px] text-ink-2">{a.detalhe}</span>}
          </span>
          <span className="flex items-center gap-2 text-[11.5px] text-ink-3">
            {a.resolvido_em ? <Badge tone="ok">resolvido {quando(a.resolvido_em)}</Badge> : <Badge tone="bad">aberto</Badge>}
            {a.notificado_em ? `avisado ${quando(a.notificado_em)}` : 'aviso pendente'}
          </span>
        </li>
      ))}
    </ul>
  )
}
