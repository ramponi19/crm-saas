import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { BarChart3, Search } from 'lucide-react'

export const metadata = { title: 'Rastreamento · Atribuição · Tracker Ads' }
export const dynamic = 'force-dynamic'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function AtribuicaoPage() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()
  const desdeDia = desde.slice(0, 10)

  const [{ data: invest }, { data: visitas }, { data: eventos }] = await Promise.all([
    db.from('tracker_investimento').select('gasto').eq('empresa_id', empresaId).gte('dia', desdeDia),
    db.from('rastreamento_visitas').select('lead_id').eq('empresa_id', empresaId).gte('criado_em', desde),
    db.from('rastreamento_eventos').select('tipo, valor').eq('empresa_id', empresaId).eq('tipo', 'purchase').gte('criado_em', desde),
  ])
  const investi = ((invest ?? []) as { gasto: number | null }[]).reduce((s, i) => s + (Number(i.gasto) || 0), 0)
  const chegaramCrm = new Set(((visitas ?? []) as { lead_id: number | null }[]).filter((v) => v.lead_id).map((v) => v.lead_id)).size
  const vendas = (eventos ?? []).length
  const receita = ((eventos ?? []) as { valor: number | null }[]).reduce((s, e) => s + (Number(e.valor) || 0), 0)
  const roas = investi > 0 ? Math.round((receita / investi) * 100) / 100 : null
  const cac = investi > 0 && vendas ? investi / vendas : null

  const cards = [
    { l: 'Investi', v: brl(investi), sub: 'entrada manual + Meta' },
    { l: 'Plataforma reportou', v: '0', sub: 'métrica do gerenciador de anúncios' },
    { l: 'Chegaram CRM', v: String(chegaramCrm), sub: 'só conta lead com contato e rastreio válido' },
    { l: 'Receita atribuída', v: brl(receita), sub: roas != null ? `ROAS ${roas}x` : 'ROAS —' },
    { l: 'CAC (escopo)', v: cac != null ? brl(cac) : '—', sub: 'investimento do escopo ÷ vendas' },
  ]
  const filtros = ['Todos os status', 'Com leads CRM', 'Veiculando', 'Pausadas', 'Sem veiculação', 'Concluídas']

  return (
    <div className="px-5 py-5 sm:px-7">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}><BarChart3 size={18} strokeWidth={1.9} /></span>
        <div><h2 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Atribuição</h2><p className="text-[12.5px]" style={{ color: C.ink3 }}>Gerenciador vs oportunidade real. Últimos 30 dias.</p></div>
      </div>

      {/* Gerenciador vs oportunidade real */}
      <div className="rounded-[14px] border p-5" style={{ borderColor: '#cfe8df', background: '#f6faf8' }}>
        <div className="text-[13px] font-semibold" style={{ color: C.ink }}>Gerenciador vs oportunidade real</div>
        <p className="mt-0.5 text-[12px]" style={{ color: C.ink3 }}>Investiu X → gerou Y leads rastreados → vendeu Z (Inbox). Métricas de pipeline ficam no Analytics.</p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {cards.map((c) => (
            <div key={c.l}><div className="text-[11px]" style={{ color: C.ink3 }}>{c.l}</div><div className="mt-0.5 text-[19px] font-bold tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{c.v}</div><div className="text-[10.5px]" style={{ color: C.ink3 }}>{c.sub}</div></div>
          ))}
        </div>
      </div>

      {/* Anúncio → venda */}
      <h3 className="mb-1 mt-6 text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Atribuição: anúncio → venda</h3>
      <p className="mb-3 text-[12.5px]" style={{ color: C.ink3 }}>Navegue Campanha → Conjunto → Anúncio e compare o que a Meta reportou com o que chegou no CRM.</p>
      <div className="mb-3 flex items-center gap-2 rounded-[10px] border px-3 py-2" style={{ borderColor: C.line, background: C.card }}>
        <Search size={16} style={{ color: C.ink3 }} /><input placeholder="Buscar por nome ou ID…" className="w-full bg-transparent text-[13px] outline-none" style={{ color: C.ink }} disabled />
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {filtros.map((f, i) => <span key={f} className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold" style={i === 0 ? { background: 'rgba(0,168,132,0.12)', color: C.tealDark } : { background: C.card, color: C.ink2, border: `1px solid ${C.line}` }}>{f}</span>)}
      </div>
      <div className="grid min-h-[120px] place-items-center rounded-[14px] border text-[13px]" style={{ borderColor: C.line, background: C.card, color: C.ink3 }}>
        Conecte o Business Manager em Configurações e sincronize para ver campanhas, conjuntos e anúncios.
      </div>
    </div>
  )
}
