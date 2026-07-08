import { createClient } from '@/lib/supabase/server'
import { ScrollText } from 'lucide-react'
import { Card, Table, EmptyState, type Column } from '@/components/ui'


function fmtDataHora(d: string) {
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const ACAO_LABEL: Record<string, string> = {
  trocar_plano: 'Trocou plano',
  alterar_status: 'Alterou status',
  estender_trial: 'Estendeu trial',
  impersonar: 'Impersonou empresa',
  reenviar_boas_vindas: 'Reenviou boas-vindas',
}

export default async function LogsPage() {
  const supabase = await createClient()

  const { data: logs } = await supabase
    .from('superadmin_logs')
    .select('id, acao, detalhes, created_at, empresa:empresas(nome), admin:usuarios!superadmin_logs_admin_user_id_fkey(nome)')
    .order('created_at', { ascending: false })
    .limit(200)

  const lista = (logs ?? []) as unknown as Array<{
    id: number
    acao: string
    detalhes: Record<string, unknown> | null
    created_at: string
    empresa: { nome: string } | null
    admin: { nome: string } | null
  }>

  type Log = (typeof lista)[number]
  const cols: Column<Log>[] = [
    { key: 'data', header: 'Data', className: 'num whitespace-nowrap', render: (log) => <span className="text-ink-2">{fmtDataHora(log.created_at)}</span> },
    { key: 'admin', header: 'Admin', render: (log) => <span className="text-ink">{log.admin?.nome ?? '—'}</span> },
    { key: 'acao', header: 'Ação', render: (log) => <span className="font-semibold text-ink">{ACAO_LABEL[log.acao] ?? log.acao}</span> },
    { key: 'empresa', header: 'Empresa', render: (log) => <span className="text-ink-2">{log.empresa?.nome ?? '—'}</span> },
  ]

  return (
    <div className="min-h-full bg-bg px-8 py-7">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Logs de atividade</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Registro de ações administrativas sobre os tenants</p>
        </div>

        <Card flush>
          <Table
            columns={cols}
            rows={lista}
            rowKey={(log) => log.id}
            empty={<EmptyState icon={<ScrollText size={22} strokeWidth={1.7} />} title="Nenhuma ação registrada ainda" description="As ações administrativas sobre os tenants aparecerão aqui." />}
          />
        </Card>
      </div>
    </div>
  )
}
