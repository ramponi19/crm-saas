import Link from 'next/link'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { Globe, FileText, Code2, MessageSquare, Link2, HelpCircle, CheckCircle2, Clock } from 'lucide-react'

export const metadata = { title: 'Rastreamento · Como chegam · Tracker Ads' }
export const dynamic = 'force-dynamic'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f', warn: '#b7791f' }
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function ComoChegamPage() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()

  let { data: cfg } = await db.from('rastreamento_config').select('public_token, meta_pixel_id, capi_ativo').eq('empresa_id', empresaId).maybeSingle()
  if (!cfg) { const ins = await db.from('rastreamento_config').insert({ empresa_id: empresaId }).select('public_token, meta_pixel_id, capi_ativo').single(); cfg = ins.data }

  const [{ data: visitas }, { count: leadsCrm }, { data: eventos }, { data: etapasGanho }] = await Promise.all([
    db.from('rastreamento_visitas').select('lead_id').eq('empresa_id', empresaId).gte('criado_em', desde),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true).gte('created_at', desde),
    db.from('rastreamento_eventos').select('tipo, valor').eq('empresa_id', empresaId).eq('tipo', 'purchase').gte('criado_em', desde),
    db.from('funil_etapas').select('slug').eq('empresa_id', empresaId).eq('tipo', 'ganho'),
  ])
  const leadsRastreados = new Set(((visitas ?? []) as { lead_id: number | null }[]).filter((v) => v.lead_id).map((v) => v.lead_id)).size
  const vendas = (eventos ?? []).length
  const receita = ((eventos ?? []) as { valor: number | null }[]).reduce((s, e) => s + (Number(e.valor) || 0), 0)
  void etapasGanho

  const pixelOk = !!cfg?.public_token
  const capiOk = !!cfg?.capi_ativo && !!cfg?.meta_pixel_id
  const metaOk = false // Marketing API não conectada ainda

  const totais = [
    { l: 'Leads', v: String(leadsRastreados) }, { l: 'Chegaram CRM', v: String(leadsCrm ?? 0) },
    { l: 'Qualificados', v: '0' }, { l: 'Vendas', v: String(vendas) }, { l: 'Receita', v: brl(receita) },
  ]
  const prereq = [
    { l: 'Conectar Meta Ads', ok: metaOk, href: '/tracker/configuracoes', cta: 'Conectar Meta Ads' },
    { l: 'Pixel e token CAPI (Meta)', ok: capiOk, href: '/tracker/rastreamento/qualidade-capi', cta: 'Sincronizar pixel' },
    { l: 'Devolver conversões (CAPI)', ok: capiOk, href: '/tracker/rastreamento/qualidade-capi', cta: 'Ver CAPI' },
  ]
  const caminhos = [
    { icon: Globe, nome: 'Anúncio → Landing Page → WhatsApp', fluxo: 'Anúncio → LP → WhatsApp', desc: 'Link curto com UTM como URL final do anúncio. Garante fbclid/gclid e UTM na LP.', href: '/tracker/links', cta: 'Abrir Links', ok: pixelOk },
    { icon: FileText, nome: 'Anúncio → Formulário nativo Meta → WhatsApp', fluxo: 'Anúncio → Lead Ads → WhatsApp', desc: 'Formulário instantâneo da Meta com rastreio automático via webhook. Precisa da Meta conectada.', href: '/tracker/configuracoes', cta: 'Gerenciar páginas', ok: metaOk },
    { icon: Code2, nome: 'Formulário Tracker embedado na LP', fluxo: 'Anúncio → LP + Form → WhatsApp', desc: 'Um embed na sua LP captura fbclid/gclid no envio. Alta confiança, sem depender do Gerenciador.', href: '/tracker/configuracoes', cta: 'Criar formulário', ok: false },
    { icon: MessageSquare, nome: 'Anúncio → WhatsApp direto (CTWA)', fluxo: 'Anúncio → WhatsApp', desc: 'Click-to-WhatsApp oficial: a Meta envia o ctwa_clid e rastreamos automaticamente. Precisa do WhatsApp Oficial.', href: '/tracker/configuracoes', cta: 'Gerenciar integrações', ok: metaOk },
    { icon: Link2, nome: 'Link rastreável (bio, página, WhatsApp)', fluxo: 'Link Tracker → WhatsApp / página', desc: 'Crie um link no Tracker para bio do Instagram, páginas ou WhatsApp sem campanha do gerenciador.', href: '/tracker/links', cta: 'Abrir Links', ok: pixelOk },
    { icon: HelpCircle, nome: 'Outras fontes', fluxo: 'Entrada direta → sem classificação', desc: 'Leads que não se encaixam em formulário Meta, Tracker, LP/UTM, CTWA ou link — ex.: contato manual.', href: '/tracker/contatos', cta: 'Ver contatos', ok: true },
  ]

  return (
    <div className="px-5 py-5 sm:px-7">
      <h2 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Como seus leads chegam</h2>
      <p className="mt-0.5 text-[12.5px]" style={{ color: C.ink3 }}>Ative os caminhos de captura que você usa — cada um rastreia a origem de um jeito.</p>

      {/* Totais por fonte */}
      <div className="mt-4 rounded-[14px] border p-5" style={{ borderColor: C.line, background: C.card }}>
        <div className="text-[13px] font-semibold" style={{ color: C.ink }}>Totais do período por fonte</div>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {totais.map((t) => (
            <div key={t.l}><div className="text-[11px]" style={{ color: C.ink3 }}>{t.l}</div><div className="mt-0.5 text-[20px] font-bold tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{t.v}</div></div>
          ))}
        </div>
      </div>

      {/* Pré-requisitos Meta */}
      <div className="mt-4 rounded-[14px] border p-5" style={{ borderColor: '#cfe8df', background: '#f6faf8' }}>
        <div className="text-[13px] font-semibold" style={{ color: C.ink }}>Pré-requisitos Meta</div>
        <p className="mt-0.5 text-[12px]" style={{ color: C.ink3 }}>Conecte a Meta e o pixel para rastrear e devolver conversões (CAPI).</p>
        <div className="mt-3 space-y-2">
          {prereq.map((p) => (
            <div key={p.l} className="flex items-center gap-2 text-[13px]">
              <span className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold" style={p.ok ? { background: 'rgba(0,168,132,0.10)', color: C.tealDark } : { background: '#fdf6e9', color: C.warn }}>{p.ok ? <CheckCircle2 size={12} /> : <Clock size={12} />}{p.ok ? 'OK' : 'Pendente'}</span>
              <span style={{ color: C.ink2 }}>{p.l}</span>
              {!p.ok && <Link href={p.href} className="ml-1 font-semibold" style={{ color: C.tealDark }}>{p.cta} →</Link>}
            </div>
          ))}
        </div>
      </div>

      {/* 6 caminhos */}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {caminhos.map((c) => (
          <div key={c.nome} className="rounded-[14px] border p-4" style={{ borderColor: C.line, background: C.card }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}><c.icon size={16} strokeWidth={1.9} /></span><span className="text-[13.5px] font-semibold" style={{ color: C.ink }}>{c.nome}</span></div>
              <span className="shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-semibold" style={c.ok ? { background: 'rgba(0,168,132,0.10)', color: C.tealDark } : { background: '#fdf6e9', color: C.warn }}>{c.ok ? 'Disponível' : 'Pendente'}</span>
            </div>
            <div className="mt-2 text-[11px]" style={{ color: C.ink3 }}>{c.fluxo}</div>
            <p className="mt-1 text-[12.5px]" style={{ color: C.ink2 }}>{c.desc}</p>
            <Link href={c.href} className="mt-2 inline-block text-[12.5px] font-semibold" style={{ color: C.tealDark }}>{c.cta} →</Link>
          </div>
        ))}
      </div>
    </div>
  )
}
