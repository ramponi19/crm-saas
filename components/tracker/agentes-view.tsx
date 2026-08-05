'use client'

import { useEffect, useState } from 'react'
import { Bot, Check, Sparkles, BookOpen, History, Info } from 'lucide-react'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }

interface Agente { tipo: string; ativo: boolean; instrucoes: string; interacoes: number; leads_qualif: number }
interface Memoria { id: number; lead_id: number | null; agente_tipo: string | null; resumo: string | null; qualificacao: string | null; criado_em: string }

const META: Record<string, { nome: string; desc: string; tag: string; preco: string; creditos: string }> = {
  qualificador: { nome: 'Agente Qualificador', desc: 'SDR de IA que qualifica os leads automaticamente nas conversas.', tag: 'Qualificador', preco: 'R$ 197/mês', creditos: '50 conversas/mês' },
  closer: { nome: 'Agente Closer', desc: 'Conduz o fechamento e responde objeções nas conversas.', tag: 'Closer', preco: 'R$ 197/mês', creditos: '50 conversas/mês' },
  mentor: { nome: 'Mentor de Vendas', desc: 'Orienta a equipe em tempo real (copiloto de atendimento).', tag: 'Copilot', preco: 'R$ 297/mês', creditos: '200 consultas/mês' },
}
const CONH = [
  { k: 'sobre', label: 'Sobre a empresa', ph: 'O que a empresa faz, para quem...' },
  { k: 'produtos', label: 'Produtos e serviços', ph: 'Principais ofertas, preços, condições...' },
  { k: 'diferenciais', label: 'Diferenciais', ph: 'Por que comprar de você...' },
  { k: 'tom_voz', label: 'Tom de voz', ph: 'Como o agente deve falar (formal, próximo...)' },
  { k: 'objecoes', label: 'Objeções comuns', ph: 'Dúvidas frequentes e como responder...' },
  { k: 'horario', label: 'Horário de atendimento', ph: 'Seg–Sex 9h–18h...' },
] as const

export function AgentesView() {
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [kpis, setKpis] = useState({ ativos: 0, interacoesHoje: 0, leadsQualif: 0 })
  const [conh, setConh] = useState<Record<string, string>>({})
  const [memoria, setMemoria] = useState<Memoria[]>([])
  const [salvandoConh, setSalvandoConh] = useState(false)
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    const r = await fetch('/api/tracker/agentes'); const d = await r.json()
    setAgentes(d.agentes ?? []); setKpis(d.kpis ?? { ativos: 0, interacoesHoje: 0, leadsQualif: 0 })
    const c: Record<string, string> = {}; for (const k of CONH) c[k.k] = (d.conhecimento?.[k.k] as string) ?? ''
    setConh(c); setMemoria(d.memoria ?? []); setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function toggle(tipo: string, ativo: boolean) {
    setAgentes((l) => l.map((a) => a.tipo === tipo ? { ...a, ativo } : a))
    setKpis((k) => ({ ...k, ativos: k.ativos + (ativo ? 1 : -1) }))
    await fetch('/api/tracker/agentes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, ativo }) }).catch(() => {})
  }
  async function salvarConh() {
    setSalvandoConh(true)
    try { await fetch('/api/tracker/agentes/conhecimento', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conh) }) } finally { setSalvandoConh(false) }
  }

  if (carregando) return <div className="h-64 animate-pulse rounded-[14px]" style={{ background: 'rgba(0,0,0,0.04)' }} />

  return (
    <div>
      <h1 className="flex items-center gap-2 text-[18px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}><Bot size={20} strokeWidth={1.9} style={{ color: C.teal }} /> Agentes de IA</h1>
      <p className="mb-4 mt-0.5 text-[13px]" style={{ color: C.ink3 }}>Ative Qualificador, Closer ou Mentor. A base de conhecimento abaixo personaliza as respostas.</p>

      {/* Aviso do motor stub */}
      <div className="mb-4 flex items-start gap-2 rounded-[12px] border px-4 py-2.5" style={{ borderColor: '#cfe8df', background: '#f6faf8' }}>
        <Info size={15} style={{ color: C.tealDark, marginTop: 2 }} />
        <p className="text-[12.5px]" style={{ color: C.ink2 }}>Estrutura pronta. O motor de análise de conversas por IA é ativado ao conectar a chave de IA — até lá, ativar um agente registra a configuração sem consumir créditos.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Agentes ativos', String(kpis.ativos)], ['Interações hoje', String(kpis.interacoesHoje)], ['Leads qualificados', String(kpis.leadsQualif)], ['Taxa média', '—']].map(([l, v]) => (
          <div key={l} className="rounded-[14px] border p-[14px_16px]" style={{ background: C.card, borderColor: C.line }}>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.ink3 }}>{l}</div>
            <div className="mt-1 text-[22px] font-bold leading-none tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Agentes */}
      <h2 className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.ink3 }}>Disponíveis para ativar</h2>
      <div className="grid gap-3 lg:grid-cols-3">
        {agentes.map((a) => {
          const m = META[a.tipo]
          return (
            <div key={a.tipo} className="rounded-[14px] border p-5" style={{ borderColor: a.ativo ? C.teal : C.line, background: C.card, boxShadow: a.ativo ? '0 0 0 1px #00a884' : 'none' }}>
              <div className="flex items-start justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: a.ativo ? C.teal : '#c7d0d6' }}>{m.tag.slice(0, 2).toUpperCase()}</span>
                <span className="rounded-[6px] px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: '#eef1f5', color: C.ink2 }}>{m.tag}</span>
              </div>
              <h3 className="mt-3 text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{m.nome}</h3>
              <p className="mt-1 min-h-[52px] text-[12.5px] leading-relaxed" style={{ color: C.ink2 }}>{m.desc}</p>
              <div className="mt-2 flex items-center justify-between text-[11.5px]" style={{ color: C.ink3 }}><span>{m.creditos}</span><span className="font-semibold" style={{ color: C.ink2 }}>{m.preco}</span></div>
              <button onClick={() => toggle(a.tipo, !a.ativo)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition-colors" style={a.ativo ? { background: 'rgba(0,168,132,0.10)', color: C.tealDark } : { background: C.teal, color: '#fff' }}>
                {a.ativo ? <><Check size={15} strokeWidth={2.4} /> Ativo</> : <><Sparkles size={15} /> Ativar</>}
              </button>
            </div>
          )
        })}
      </div>

      {/* Base de conhecimento */}
      <h2 className="mb-2 mt-8 flex items-center gap-2 text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}><BookOpen size={17} strokeWidth={1.9} style={{ color: C.teal }} /> Conhecimento da empresa</h2>
      <p className="mb-3 text-[12.5px]" style={{ color: C.ink3 }}>Quanto mais completo, melhores as respostas dos agentes.</p>
      <div className="grid gap-3 rounded-[14px] border p-5 sm:grid-cols-2" style={{ borderColor: C.line, background: C.card }}>
        {CONH.map((f) => (
          <label key={f.k} className={`block ${f.k === 'sobre' || f.k === 'produtos' ? 'sm:col-span-2' : ''}`}>
            <span className="mb-1 block text-[12px] font-medium" style={{ color: C.ink2 }}>{f.label}</span>
            <textarea rows={f.k === 'sobre' || f.k === 'produtos' ? 2 : 2} value={conh[f.k] ?? ''} onChange={(e) => setConh((c) => ({ ...c, [f.k]: e.target.value }))} placeholder={f.ph} className="tk-ag resize-none" />
          </label>
        ))}
        <div className="sm:col-span-2 flex justify-end"><button onClick={salvarConh} disabled={salvandoConh} className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: C.teal }}>Salvar conhecimento</button></div>
      </div>

      {/* Memória de Jornada */}
      <h2 className="mb-2 mt-8 flex items-center gap-2 text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}><History size={17} strokeWidth={1.9} style={{ color: C.teal }} /> Memória de Jornada</h2>
      <p className="mb-3 text-[12.5px]" style={{ color: C.ink3 }}>Resumo e qualificação gravados ao encerrar cada conversa (com Qualificador ou Closer ativo).</p>
      {memoria.length === 0 ? (
        <div className="rounded-[14px] border px-4 py-8 text-center text-[13px]" style={{ borderColor: C.line, background: C.card, color: C.ink3 }}>Ainda sem memórias — aparecem quando os agentes analisarem as conversas.</div>
      ) : (
        <div className="space-y-2">
          {memoria.map((m) => (
            <div key={m.id} className="rounded-[12px] border p-4" style={{ borderColor: C.line, background: C.card }}>
              <div className="flex items-center justify-between"><span className="text-[12px] font-semibold" style={{ color: C.ink2 }}>{m.agente_tipo || 'agente'}</span>{m.qualificacao && <span className="rounded-[6px] px-2 py-0.5 text-[11px] font-semibold" style={{ background: '#eef1f5', color: C.ink2 }}>{m.qualificacao}</span>}</div>
              <p className="mt-1 text-[13px]" style={{ color: C.ink }}>{m.resumo}</p>
            </div>
          ))}
        </div>
      )}
      <style>{`.tk-ag{width:100%;border:1px solid ${C.line};border-radius:10px;padding:8px 11px;font-size:13px;color:${C.ink};background:#fff;outline:none}.tk-ag:focus{border-color:${C.teal};box-shadow:0 0 0 3px rgba(0,168,132,.12)}`}</style>
    </div>
  )
}
