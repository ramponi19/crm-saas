import Link from 'next/link'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { ShieldCheck, ChevronRight } from 'lucide-react'

export const metadata = { title: 'Rastreamento · Qualidade & CAPI · Tracker Ads' }
export const dynamic = 'force-dynamic'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f', bad: '#d92d20' }

export default async function QualidadeCapiPage() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()

  const [{ data: visitas }, { data: eventos }, { data: leads }, { data: etapas }] = await Promise.all([
    db.from('rastreamento_visitas').select('lead_id, fbclid').eq('empresa_id', empresaId).gte('criado_em', desde),
    db.from('rastreamento_eventos').select('tipo, capi_status').eq('empresa_id', empresaId).gte('criado_em', desde),
    db.from('leads').select('kanban_status').eq('empresa_id', empresaId).eq('ativo', true),
    db.from('funil_etapas').select('slug, tipo').eq('empresa_id', empresaId),
  ])

  const V = (visitas ?? []) as { lead_id: number | null; fbclid: string | null }[]
  const E = (eventos ?? []) as { tipo: string; capi_status: string }[]
  const L = (leads ?? []) as { kanban_status: string | null }[]
  const tipoPorSlug = new Map(((etapas ?? []) as { slug: string; tipo: string | null }[]).map((e) => [e.slug, e.tipo]))

  const leadsPagos = new Set(V.filter((v) => v.lead_id && v.fbclid).map((v) => v.lead_id)).size
  const rastreados = new Set(V.filter((v) => v.lead_id).map((v) => v.lead_id))
  const desqualificados = L.filter((l) => tipoPorSlug.get(l.kanban_status || '') === 'perdido').length
  const capiEnviados = E.filter((e) => e.capi_status === 'enviado').length
  const aguardando = rastreados.size
  const leadConfirmado = E.filter((e) => e.tipo === 'lead' && e.capi_status === 'enviado').length
  const purchase = E.filter((e) => e.tipo === 'purchase' && e.capi_status === 'enviado').length

  const kpis = [
    { l: 'Leads pagos (período)', v: String(leadsPagos), cor: C.ink },
    { l: 'Desqualificados', v: String(desqualificados), cor: C.bad },
    { l: 'Eventos CAPI enviados', v: String(capiEnviados), cor: C.tealDark },
    { l: 'Rastreados aguardando qualificação', v: String(aguardando), cor: C.ink },
  ]
  const devolvido = [
    { l: 'Lead confirmado', v: leadConfirmado }, { l: 'LeadSubmitted (CTWA)', v: 0 }, { l: 'Purchase', v: purchase },
  ]

  return (
    <div className="px-5 py-5 sm:px-7">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}><ShieldCheck size={18} strokeWidth={1.9} /></span>
        <div><h2 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Qualidade &amp; Otimização (CAPI)</h2><p className="text-[12.5px]" style={{ color: C.ink3 }}>Identifique leads desqualificados e confirme os sinais devolvidos à Meta via CAPI. Últimos 30 dias.</p></div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-[14px] border p-[16px_18px]" style={{ background: C.card, borderColor: C.line }}>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.ink3 }}>{k.l}</div>
            <div className="mt-1.5 text-[24px] font-bold leading-none tracking-[-0.03em]" style={{ color: k.cor, fontFamily: 'var(--font-sora)' }}>{k.v}</div>
          </div>
        ))}
      </div>

      <h3 className="mb-2 mt-6 text-[13px] font-semibold" style={{ color: C.ink }}>Devolvido à Meta (CAPI)</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {devolvido.map((d) => (
          <div key={d.l} className="rounded-[14px] border p-[16px_18px]" style={{ background: C.card, borderColor: C.line }}>
            <div className="text-[12px]" style={{ color: C.ink3 }}>{d.l}</div>
            <div className="mt-1 text-[24px] font-bold tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{d.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-[12px] border px-4 py-3" style={{ borderColor: '#cfe8df', background: '#f6faf8' }}>
        <p className="text-[12.5px]" style={{ color: C.ink2 }}>Com Business Manager e pixel conectados, devolvemos <strong>Lead/LeadSubmitted</strong> quando o lead é marcado como qualificado no Inbox e <strong>Purchase</strong> (com valor) quando vira venda. Desqualificado não envia nada — assim o algoritmo da Meta otimiza por quem vira comprador, não só cliques.</p>
      </div>

      <Link href="/tracker/configuracoes" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: C.tealDark }}>Configurar pixel &amp; token CAPI <ChevronRight size={15} /></Link>
    </div>
  )
}
