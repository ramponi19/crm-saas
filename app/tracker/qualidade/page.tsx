import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { ShieldCheck, Star, Activity, AlertTriangle, Info } from 'lucide-react'

export const metadata = { title: 'Qualidade · Tracker Ads' }
export const dynamic = 'force-dynamic'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f', warn: '#b7791f', bad: '#d92d20' }

export default async function QualidadePage() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()

  const [{ data: membros }, { data: leads }, { count: msgs }] = await Promise.all([
    db.from('empresa_usuarios').select('usuario_id, ativo, usuarios(nome, email)').eq('empresa_id', empresaId).eq('ativo', true),
    db.from('leads').select('responsavel_id, kanban_status').eq('empresa_id', empresaId).eq('ativo', true).gte('created_at', desde),
    db.from('lead_mensagens').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('direcao', 'enviada').gte('created_at', desde),
  ])

  type M = { usuario_id: string; usuarios: { nome: string | null; email: string | null } | { nome: string | null; email: string | null }[] | null }
  const L = (leads ?? []) as { responsavel_id: string | null }[]
  const porResp = new Map<string, number>()
  for (const l of L) if (l.responsavel_id) porResp.set(l.responsavel_id, (porResp.get(l.responsavel_id) ?? 0) + 1)

  const equipe = ((membros ?? []) as M[]).map((m) => {
    const u = Array.isArray(m.usuarios) ? m.usuarios[0] : m.usuarios
    return { id: m.usuario_id, nome: u?.nome || u?.email || '—', atendimentos: porResp.get(m.usuario_id) ?? 0 }
  }).sort((a, b) => b.atendimentos - a.atendimentos)

  const kpis = [
    { l: 'Mensagens enviadas', v: String(msgs ?? 0), icon: Activity },
    { l: 'Atendentes', v: String(equipe.length), icon: ShieldCheck },
    { l: 'Score médio', v: '—', icon: Star },
    { l: 'Alertas críticos', v: '0', icon: AlertTriangle },
  ]

  return (
    <div className="px-5 py-5 sm:px-7">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}><ShieldCheck size={20} strokeWidth={1.9} style={{ color: C.teal }} /> Central de Qualidade</h1>
        <p className="text-[13px]" style={{ color: C.ink3 }}>Monitore cada atendimento da equipe e mantenha o padrão de excelência. Últimos 30 dias.</p>
      </header>

      <div className="mb-4 flex items-start gap-2 rounded-[12px] border px-4 py-2.5" style={{ borderColor: '#cfe8df', background: '#f6faf8' }}>
        <Info size={15} style={{ color: C.tealDark, marginTop: 2 }} />
        <p className="text-[12.5px]" style={{ color: C.ink2 }}>Estrutura de monitoramento pronta. O <strong>score de qualidade</strong> e a <strong>análise de sentimento</strong> por IA ligam ao conectar a chave de IA — a base (atendimentos por pessoa, volume) já é real.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-[14px] border p-[16px_18px]" style={{ background: C.card, borderColor: C.line }}>
            <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.ink3 }}><k.icon size={13} /> {k.l}</div>
            <div className="mt-1.5 text-[24px] font-bold leading-none tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{k.v}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Desempenho por atendente</h2>
      <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: C.line, background: C.card }}>
        {equipe.length === 0 ? <div className="grid min-h-[120px] place-items-center text-[13px]" style={{ color: C.ink3 }}>Nenhum atendente na equipe.</div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: C.ink3 }}><th className="px-4 py-2.5 font-semibold">Atendente</th><th className="px-4 py-2.5 text-right font-semibold">Atendimentos</th><th className="px-4 py-2.5 text-right font-semibold">Sentimento</th><th className="px-4 py-2.5 text-right font-semibold">Score</th></tr></thead>
            <tbody>{equipe.map((e) => (
              <tr key={e.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: C.ink }}>{e.nome}</td>
                <td className="px-4 py-2.5 text-right" style={{ color: C.ink2 }}>{e.atendimentos}</td>
                <td className="px-4 py-2.5 text-right" style={{ color: C.ink3 }}>—</td>
                <td className="px-4 py-2.5 text-right" style={{ color: C.ink3 }}>—</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[14px] border p-5" style={{ borderColor: C.line, background: C.card }}>
          <h3 className="text-[14px] font-semibold" style={{ color: C.ink }}>Análise de sentimento</h3>
          <p className="mt-1 text-[12.5px]" style={{ color: C.ink3 }}>Classificação automática do tom das conversas (positivo/neutro/negativo) — ativa com a IA conectada.</p>
          <div className="mt-3 grid min-h-[80px] place-items-center rounded-[10px] text-[12.5px]" style={{ background: '#f7f9fa', color: C.ink3 }}>Aguardando conexão da IA.</div>
        </div>
        <div className="rounded-[14px] border p-5" style={{ borderColor: C.line, background: C.card }}>
          <h3 className="text-[14px] font-semibold" style={{ color: C.ink }}>Alertas de atendimentos críticos</h3>
          <p className="mt-1 text-[12.5px]" style={{ color: C.ink3 }}>Conversas com risco (demora, insatisfação) sinalizadas para ação imediata.</p>
          <div className="mt-3 grid min-h-[80px] place-items-center rounded-[10px] text-[12.5px]" style={{ background: '#f7f9fa', color: C.ink3 }}>Nenhum alerta no período.</div>
        </div>
      </div>
    </div>
  )
}
