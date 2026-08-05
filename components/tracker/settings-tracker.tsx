'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AgentesView } from '@/components/tracker/agentes-view'
import { AutomacoesView } from '@/components/tracker/automacoes-view'
import {
  Building2, Layers, Plug, GitBranch, Users, Bot, Zap, MessageSquareText, Tag, Contact,
  Globe, FileText, Link2, Bell, LifeBuoy, CreditCard, Copy, Check, ChevronRight, CheckCircle2, Circle,
} from 'lucide-react'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }

interface Props {
  empresaNome: string
  empresaStatus: string | null
  canais: { tipo: string; nome_exibicao: string | null; status: string | null }[]
  equipe: { nome: string; email: string | null; role: string; ativo: boolean }[]
  pixel: { public_token: string | null; meta_pixel_id: string | null; capi_ativo: boolean }
  appUrl: string
}

const TABS = [
  { k: 'empresa', label: 'Empresa', icon: Building2 },
  { k: 'setores', label: 'Setores', icon: Layers },
  { k: 'canais', label: 'Canais', icon: Plug },
  { k: 'crm', label: 'CRM', icon: GitBranch },
  { k: 'equipe', label: 'Equipe', icon: Users },
  { k: 'agentes', label: 'Agentes de IA', icon: Bot },
  { k: 'automacoes', label: 'Automações', icon: Zap },
  { k: 'respostas', label: 'Respostas rápidas', icon: MessageSquareText },
  { k: 'tags', label: 'Tags', icon: Tag },
  { k: 'contatos', label: 'Contatos', icon: Contact },
  { k: 'idioma', label: 'Idioma', icon: Globe },
  { k: 'formularios', label: 'Formulários', icon: FileText },
  { k: 'integracoes', label: 'Integrações', icon: Link2 },
  { k: 'notificacoes', label: 'Notificações', icon: Bell },
  { k: 'suporte', label: 'Suporte', icon: LifeBuoy },
  { k: 'assinatura', label: 'Assinatura', icon: CreditCard },
] as const
type TabKey = typeof TABS[number]['k']
const TIPO: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger' }

export function SettingsTracker(p: Props) {
  const [tab, setTab] = useState<TabKey>('empresa')
  const [nome, setNome] = useState(p.empresaNome)
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  async function salvarEmpresa() {
    setSalvando(true)
    try { await fetch('/api/tracker/empresa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) }) } finally { setSalvando(false) }
  }

  return (
    <div className="flex h-full min-h-0">
      <nav className="hidden w-[210px] shrink-0 space-y-0.5 overflow-y-auto border-r p-3 md:block" style={{ borderColor: C.line, background: C.card }}>
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.k} onClick={() => setTab(t.k)} className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-[9px] text-left text-[13px] font-medium transition-colors" style={tab === t.k ? { background: 'rgba(0,168,132,0.10)', color: C.tealDark, fontWeight: 600 } : { color: C.ink2 }}>
              <Icon size={16} strokeWidth={1.8} style={{ opacity: tab === t.k ? 1 : 0.8 }} /><span className="flex-1 truncate">{t.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        {tab === 'empresa' && (
          <Secao titulo="Empresa" sub="Informações gerais da sua empresa.">
            <label className="block max-w-md"><span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>Nome fantasia</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className="tk-s" /></label>
            <button onClick={salvarEmpresa} disabled={salvando} className="mt-3 rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.teal }}>Salvar</button>
            <div className="mt-4 max-w-md space-y-2 rounded-[12px] border p-4" style={{ borderColor: C.line }}>
              <Info label="Status" valor={p.empresaStatus || '—'} />
            </div>
          </Secao>
        )}

        {tab === 'canais' && (
          <Secao titulo="Canais" sub="WhatsApp, Instagram e Messenger conectados.">
            {p.canais.length === 0 ? <Vazio texto="Nenhum canal conectado. Conecte no CRM em Administração → Canais." /> : (
              <div className="max-w-lg space-y-2">
                {p.canais.map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded-[12px] border px-4 py-3" style={{ borderColor: C.line }}>
                    <span className="text-[13.5px] font-medium" style={{ color: C.ink }}>{c.nome_exibicao || TIPO[c.tipo] || c.tipo}</span>
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: c.status === 'ativo' ? C.tealDark : C.ink3 }}>{c.status === 'ativo' ? <CheckCircle2 size={14} /> : <Circle size={14} />}{c.status === 'ativo' ? 'Ativo' : (c.status || 'inativo')}</span>
                  </div>
                ))}
              </div>
            )}
          </Secao>
        )}

        {tab === 'equipe' && (
          <Secao titulo="Equipe" sub="Membros com acesso a esta empresa.">
            <div className="max-w-lg space-y-2">
              {p.equipe.map((m, i) => (
                <div key={i} className="flex items-center gap-3 rounded-[12px] border px-4 py-3" style={{ borderColor: C.line }}>
                  <span className="grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: C.teal }}>{(m.nome || '?').slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-semibold" style={{ color: C.ink }}>{m.nome}</div><div className="truncate text-[12px]" style={{ color: C.ink3 }}>{m.email}</div></div>
                  <span className="rounded-[6px] px-2 py-0.5 text-[11px] font-semibold capitalize" style={{ background: '#eef1f5', color: C.ink2 }}>{m.role}</span>
                </div>
              ))}
            </div>
          </Secao>
        )}

        {tab === 'integracoes' && (
          <Secao titulo="Integrações" sub="Pixel, Conversions API e conexões externas.">
            <div className="max-w-lg space-y-2">
              <div className="rounded-[12px] border p-4" style={{ borderColor: C.line }}>
                <div className="flex items-center justify-between"><span className="text-[13.5px] font-semibold" style={{ color: C.ink }}>Pixel de rastreamento</span><span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: p.pixel.public_token ? C.tealDark : C.ink3 }}>{p.pixel.public_token ? <CheckCircle2 size={14} /> : <Circle size={14} />}{p.pixel.public_token ? 'Pronto' : 'Não configurado'}</span></div>
                {p.pixel.public_token && (
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-[#f1f4f6] px-2 py-1 text-[12px]" style={{ color: C.ink2 }}>{p.appUrl}/track.js · {p.pixel.public_token}</code>
                    <button onClick={() => { navigator.clipboard.writeText(`<script src="${p.appUrl}/track.js" data-company="${p.pixel.public_token}" async defer></script>`); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }} className="inline-flex items-center gap-1 rounded-[8px] border px-2 py-1 text-[12px] font-semibold" style={{ borderColor: C.line, color: C.ink2 }}>{copiado ? <><Check size={12} /> ok</> : <><Copy size={12} /> copiar</>}</button>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between rounded-[12px] border p-4" style={{ borderColor: C.line }}><span className="text-[13.5px] font-semibold" style={{ color: C.ink }}>Conversions API (CAPI)</span><span className="text-[12px] font-semibold" style={{ color: p.pixel.capi_ativo ? C.tealDark : C.ink3 }}>{p.pixel.capi_ativo ? 'Ativa' : 'Desativada'}</span></div>
              <Link href="/tracker/rastreamento/como-chegam" className="flex items-center justify-between rounded-[12px] border p-4 transition-shadow hover:shadow-sm" style={{ borderColor: C.line }}><span className="text-[13.5px] font-semibold" style={{ color: C.ink }}>Configurar caminhos de captura</span><ChevronRight size={18} style={{ color: C.ink3 }} /></Link>
            </div>
          </Secao>
        )}

        {tab === 'assinatura' && (
          <Secao titulo="Assinatura" sub="Plano e cobrança da empresa.">
            <div className="max-w-md rounded-[12px] border p-4" style={{ borderColor: C.line }}>
              <Info label="Status da conta" valor={p.empresaStatus || '—'} />
              <p className="mt-2 text-[12px]" style={{ color: C.ink3 }}>A gestão de plano e pagamento é feita no CRM.</p>
            </div>
          </Secao>
        )}

        {tab === 'crm' && <Atalho titulo="CRM" sub="Pipelines, etapas e qualificação." href="/tracker/crm" cta="Abrir CRM" />}
        {tab === 'contatos' && <Atalho titulo="Contatos" sub="Base de leads e clientes." href="/tracker/contatos" cta="Abrir Contatos" />}

        {tab === 'agentes' && <AgentesView />}
        {tab === 'automacoes' && <AutomacoesView />}
        {tab === 'formularios' && <Dedicado titulo="Formulários" sub="Captura de leads (Meta Lead Ads e formulários próprios) que alimentam o CRM e o Rastreamento." />}
        {tab === 'setores' && <Dedicado titulo="Setores" sub="Organize a equipe em setores para roteamento e relatórios." />}
        {tab === 'respostas' && <Dedicado titulo="Respostas rápidas" sub="Atalhos de mensagem para agilizar o atendimento no Inbox." />}
        {tab === 'tags' && <Dedicado titulo="Tags" sub="Etiquetas para classificar conversas e contatos." />}
        {tab === 'idioma' && <Dedicado titulo="Idioma" sub="Idioma da interface e dos modelos de mensagem." />}
        {tab === 'notificacoes' && <Dedicado titulo="Notificações" sub="Quais eventos geram push e alertas (lead novo, SLA, tarefa, pagamento)." />}
        {tab === 'suporte' && <Dedicado titulo="Suporte" sub="Fale com o suporte da plataforma." />}
      </div>
      <style>{`.tk-s{width:100%;border:1px solid ${C.line};border-radius:10px;padding:8px 11px;font-size:13.5px;color:${C.ink};background:#fff;outline:none}.tk-s:focus{border-color:${C.teal};box-shadow:0 0 0 3px rgba(0,168,132,.12)}`}</style>
    </div>
  )
}

function Secao({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return <div><h1 className="text-[18px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{titulo}</h1><p className="mb-4 mt-0.5 text-[13px]" style={{ color: C.ink3 }}>{sub}</p>{children}</div>
}
function Info({ label, valor }: { label: string; valor: string }) {
  return <div className="flex items-center justify-between text-[13px]"><span style={{ color: C.ink3 }}>{label}</span><span className="font-semibold" style={{ color: C.ink }}>{valor}</span></div>
}
function Vazio({ texto }: { texto: string }) {
  return <div className="rounded-[12px] border px-4 py-6 text-center text-[13px]" style={{ borderColor: C.line, color: C.ink3 }}>{texto}</div>
}
function Atalho({ titulo, sub, href, cta }: { titulo: string; sub: string; href: string; cta: string }) {
  return <Secao titulo={titulo} sub={sub}><Link href={href} className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: C.teal }}>{cta} <ChevronRight size={15} /></Link></Secao>
}
function Dedicado({ titulo, sub }: { titulo: string; sub: string }) {
  return <Secao titulo={titulo} sub={sub}><div className="rounded-[12px] border px-4 py-6 text-[13px]" style={{ borderColor: C.line, background: '#f7f9fa', color: C.ink2 }}>Módulo dedicado — disponível como parte do Nexus Tracker. A configuração fina deste recurso entra na evolução do módulo.</div></Secao>
}
