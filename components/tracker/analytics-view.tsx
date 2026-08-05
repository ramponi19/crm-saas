'use client'

import { useState } from 'react'
import { Sparkles, X, Send } from 'lucide-react'
import type { Analytics } from '@/lib/tracker/analytics'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f', bad: '#d92d20' }

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[14px] border p-[16px_18px]" style={{ background: C.card, borderColor: C.line }}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.ink3 }}>{label}</div>
      <div className="mt-1.5 text-[24px] font-bold leading-none tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{value}</div>
      <div className="mt-1.5 text-[11px]" style={{ color: C.ink3 }}>{sub}</div>
    </div>
  )
}
function Panel({ title, sub, children, full }: { title: string; sub: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`rounded-[14px] border ${full ? 'lg:col-span-2' : ''}`} style={{ background: C.card, borderColor: C.line }}>
      <div className="px-5 pt-4"><h3 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{title}</h3><p className="mt-0.5 text-[12.5px]" style={{ color: C.ink3 }}>{sub}</p></div>
      <div className="p-5 pt-3">{children}</div>
    </div>
  )
}

export function AnalyticsView({ a }: { a: Analytics }) {
  const [aba, setAba] = useState<'geral' | 'fonte'>('geral')
  const [atlas, setAtlas] = useState(false)

  return (
    <div className="px-5 py-5 sm:px-7">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Analytics</h1>
          <p className="text-[13px]" style={{ color: C.ink3 }}>Resposta do lead e avanço no funil CRM.</p>
        </div>
        <button onClick={() => setAtlas(true)} className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}><Sparkles size={15} /> Pergunte ao Atlas</button>
      </header>

      <div className="mb-3 inline-flex gap-0.5 rounded-[10px] p-0.5" style={{ background: '#e7efec' }}>
        {(['geral', 'fonte'] as const).map((v) => <button key={v} onClick={() => setAba(v)} className="rounded-[8px] px-4 py-1.5 text-[13px] font-semibold transition-colors" style={aba === v ? { background: C.card, color: C.tealDark } : { color: C.ink2 }}>{v === 'geral' ? 'Visão geral' : 'Por fonte'}</button>)}
      </div>

      {aba === 'geral' ? (
        <>
          <p className="mb-3 text-[12.5px]" style={{ color: C.ink3 }}>Indicadores do lead e do funil CRM — separado da Qualidade (análise do time).</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="% resposta do lead" value={`${a.taxaResposta}%`} sub={`${a.respondidos}/${a.tocados} tocados`} />
            <Kpi label="Tempo mediano do lead" value={a.tempoMedio1oContatoH == null ? '—' : `${a.tempoMedio1oContatoH}h`} sub="Até a 1ª resposta do lead" />
            <Kpi label="Atendimentos" value={String(a.atendimentos)} sub="1ª mensagem do vendedor" />
            <Kpi label="Ganhos" value={String(a.ganhos)} sub="dos atendimentos" />
            <Kpi label="Perdidos" value={String(a.perdidos)} sub="dos atendimentos" />
            <Kpi label="Ciclo até ganho" value={a.cicloAteGanhoDias == null ? '—' : `${a.cicloAteGanhoDias}d`} sub="Média dos ganhos no período" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title="Resposta do lead" sub="Conversas cuja 1ª mensagem enviada caiu no período e o lead respondeu depois.">
              <div className="h-2 overflow-hidden rounded-full" style={{ background: '#eef1f5' }}><div className="h-full rounded-full" style={{ width: `${a.tocados ? (a.respondidos / a.tocados) * 100 : 0}%`, background: C.teal }} /></div>
              <div className="mt-2 text-[12.5px]" style={{ color: C.ink2 }}>{a.respondidos} de {a.tocados} conversas com resposta do lead</div>
              <div className="text-[12px]" style={{ color: C.ink3 }}>{a.tocados > 0 && a.respondidos === a.tocados ? 'Todas as conversas tocadas tiveram resposta do lead' : 'Baseado nas conversas tocadas no período'}</div>
            </Panel>

            <Panel title="Por que perdemos" sub="Motivos de perda dos negócios fechados no período.">
              {a.motivosPerda.length === 0 ? <div className="text-[13px]" style={{ color: C.ink3 }}>Nenhuma perda com motivo no período.</div> : (
                <div className="space-y-2">{a.motivosPerda.map((m) => {
                  const max = Math.max(1, ...a.motivosPerda.map((x) => x.total))
                  return <div key={m.label} className="flex items-center gap-3"><span className="w-32 shrink-0 truncate text-[12.5px]" style={{ color: C.ink2 }}>{m.label}</span><div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: '#eef1f5' }}><div className="h-full rounded-full" style={{ width: `${(m.total / max) * 100}%`, background: C.bad }} /></div><span className="w-8 shrink-0 text-right text-[12.5px] font-semibold" style={{ color: C.ink }}>{m.total}</span></div>
                })}</div>
              )}
            </Panel>

            <Panel full title="Funil — onde o lead trava" sub="Alcance cumulativo da coorte no período; saltos contam as etapas intermediárias, sem inventar tempo de permanência.">
              {a.funilCoorte.length === 0 || a.funilCoorte.every((f) => f.alcancaram === 0) ? <div className="text-[13px]" style={{ color: C.ink3 }}>Nenhum estágio aberto neste pipeline.</div> : (
                <div className="space-y-3">{a.funilCoorte.map((f) => {
                  const max = Math.max(1, ...a.funilCoorte.map((x) => x.alcancaram))
                  return <div key={f.label}><div className="mb-1 flex justify-between text-[12.5px]"><span style={{ color: C.ink2 }}>{f.label}{f.taxa != null && <span style={{ color: C.ink3 }}> · {f.taxa}%</span>}</span><span className="font-semibold" style={{ color: C.ink }}>{f.alcancaram}</span></div><div className="h-2.5 overflow-hidden rounded-full" style={{ background: '#eef1f5' }}><div className="h-full rounded-full" style={{ width: `${(f.alcancaram / max) * 100}%`, background: C.tealDark }} /></div></div>
                })}</div>
              )}
            </Panel>

            <Panel full title="Estoque atual no CRM" sub="Negócios abertos agora por estágio (foto, não coorte).">
              {a.estoqueFunil.every((f) => f.total === 0) ? <div className="text-[13px]" style={{ color: C.ink3 }}>Sem negócios abertos.</div> : (
                <div className="space-y-2.5">{a.estoqueFunil.map((f) => {
                  const max = Math.max(1, ...a.estoqueFunil.map((x) => x.total))
                  return <div key={f.label} className="flex items-center gap-3"><span className="w-32 shrink-0 truncate text-[12.5px]" style={{ color: C.ink2 }}>{f.label}</span><div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: '#eef1f5' }}><div className="h-full rounded-full" style={{ width: `${(f.total / max) * 100}%`, background: f.cor }} /></div><span className="w-8 shrink-0 text-right text-[12.5px] font-semibold" style={{ color: C.ink }}>{f.total}</span></div>
                })}</div>
              )}
            </Panel>
          </div>
        </>
      ) : (
        <Panel title="Desempenho por fonte" sub="Leads, ganhos e perdidos por origem.">
          {a.porFonte.length === 0 ? <div className="grid min-h-[120px] place-items-center text-[13px]" style={{ color: C.ink3 }}>Sem dados por fonte.</div> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: C.ink3 }}><th className="pb-2 font-semibold">Fonte</th><th className="pb-2 text-right font-semibold">Leads</th><th className="pb-2 text-right font-semibold">Ganhos</th><th className="pb-2 text-right font-semibold">Perdidos</th><th className="pb-2 text-right font-semibold">Conversão</th></tr></thead>
              <tbody>{a.porFonte.map((f) => { const conv = (f.ganhos + f.perdidos) ? Math.round((f.ganhos / (f.ganhos + f.perdidos)) * 100) : 0; return (
                <tr key={f.fonte} style={{ borderTop: `1px solid ${C.line}` }}><td className="py-2 font-medium" style={{ color: C.ink }}>{f.fonte}</td><td className="py-2 text-right" style={{ color: C.ink2 }}>{f.leads}</td><td className="py-2 text-right" style={{ color: C.tealDark }}>{f.ganhos}</td><td className="py-2 text-right" style={{ color: C.bad }}>{f.perdidos}</td><td className="py-2 text-right font-semibold" style={{ color: C.ink }}>{conv}%</td></tr>
              )})}</tbody></table></div>
          )}
        </Panel>
      )}

      {atlas && (
        <div className="fixed inset-0 z-[70]" onMouseDown={(e) => { if (e.target === e.currentTarget) setAtlas(false) }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-[400px] flex-col border-l" style={{ background: C.card, borderColor: C.line }}>
            <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: C.line }}>
              <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-full text-white" style={{ background: C.teal }}><Sparkles size={17} /></span><div><div className="text-[15px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Atlas</div><div className="text-[11.5px]" style={{ color: C.ink3 }}>Especialista do produto — com base na sua conta</div></div></div>
              <button onClick={() => setAtlas(false)} className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: C.ink3 }}><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="rounded-[12px] px-3 py-2.5 text-[13px]" style={{ background: '#f1f4f6', color: C.ink2 }}>Olá! Posso explicar seus números, apontar o gargalo do funil e sugerir próximos passos. (A resposta ao vivo liga ao conectar a chave de IA.)</div>
              <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.ink3 }}>Chat rápido</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">{['Onde meu funil trava?', 'Qual origem converte mais?', 'Por que perdi negócios?', 'Como melhorar a resposta?'].map((q) => <span key={q} className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ background: 'rgba(0,168,132,0.10)', color: C.tealDark }}>{q}</span>)}</div>
            </div>
            <div className="flex items-center gap-2 border-t px-4 py-3" style={{ borderColor: C.line }}>
              <input disabled placeholder="Conecte a IA para conversar…" className="flex-1 rounded-[10px] px-3 py-2.5 text-[13px] outline-none" style={{ background: '#f1f4f6', color: C.ink3 }} />
              <button disabled className="grid h-10 w-10 place-items-center rounded-full text-white opacity-40" style={{ background: C.teal }}><Send size={16} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
