import { createClient } from '@/lib/supabase/server'

const ADMIN_COR = '#7C3AED'

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

  return (
    <div className="px-8 py-7 max-w-[1400px]">
      <div className="mb-6">
        <p className="font-mono text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: ADMIN_COR }}>
          Painel global
        </p>
        <h1 className="font-sans font-extrabold text-[26px] text-[#16212E] tracking-tight">
          Logs de atividade
        </h1>
        <p className="text-[14px] text-[#788698] mt-1">
          Registro de ações administrativas sobre os tenants
        </p>
      </div>

      <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#16212E]/[0.07]">
              <th className="text-left font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-5 py-3.5">Data</th>
              <th className="text-left font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-3 py-3.5">Admin</th>
              <th className="text-left font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-3 py-3.5">Ação</th>
              <th className="text-left font-mono text-[10px] tracking-[0.12em] uppercase text-[#9AA7B6] px-3 py-3.5">Empresa</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-[14px] text-[#9AA7B6]">
                  Nenhuma ação registrada ainda.
                </td>
              </tr>
            )}
            {lista.map(log => (
              <tr key={log.id} className="border-b border-[#16212E]/[0.05] last:border-0">
                <td className="px-5 py-3.5 text-[13px] text-[#56657A] font-mono whitespace-nowrap">
                  {fmtDataHora(log.created_at)}
                </td>
                <td className="px-3 py-3.5 text-[13px] text-[#16212E]">{log.admin?.nome ?? '—'}</td>
                <td className="px-3 py-3.5 text-[13px] font-semibold text-[#16212E]">
                  {ACAO_LABEL[log.acao] ?? log.acao}
                </td>
                <td className="px-3 py-3.5 text-[13px] text-[#56657A]">{log.empresa?.nome ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
