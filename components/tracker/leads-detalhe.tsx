'use client'

import { useState } from 'react'
import { ORIGEM_LABEL, type OrigemBucket, type LeadDetalhe } from '@/lib/tracker/rastreamento-detalhe'

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }
const ORDEM: OrigemBucket[] = ['metalead', 'ctwa', 'lp', 'link', 'outros']
const data = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

export function LeadsDetalhe({ total, contagem, leads, metaConectado }: {
  total: number; contagem: Record<OrigemBucket, number>; leads: LeadDetalhe[]; metaConectado: boolean
}) {
  const [filtro, setFiltro] = useState<OrigemBucket | 'todos'>('todos')
  const filtrados = filtro === 'todos' ? leads : leads.filter((l) => l.bucket === filtro)

  return (
    <div className="px-5 py-5 sm:px-7">
      {!metaConectado && (
        <div className="mb-4 flex items-center gap-2 rounded-[12px] border px-4 py-3 text-[13px]" style={{ borderColor: '#f0d8a8', background: '#fdf6e9', color: '#8a6d1f' }}>
          <span className="font-semibold">Rastreio incompleto.</span> Conecte a Meta para comparar Gerenciador vs CRM com confiança (Meta Lead Ads e CTWA).
        </div>
      )}

      <div className="mb-3">
        <h2 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Leads no CRM</h2>
        <p className="mt-0.5 text-[12.5px]" style={{ color: C.ink3 }}>Origem de cada lead. Cliques na LP sem conversão não aparecem — veja Visitas em Links.</p>
      </div>

      {/* Cards por origem */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="TOTAL" valor={total} ativo={filtro === 'todos'} onClick={() => setFiltro('todos')} destaque />
        {ORDEM.map((b) => (
          <Card key={b} label={ORIGEM_LABEL[b].toUpperCase()} valor={contagem[b]} ativo={filtro === b} onClick={() => setFiltro(b)} />
        ))}
      </div>

      {/* Tabela */}
      <div className="mt-5 overflow-hidden rounded-[14px] border" style={{ borderColor: C.line, background: C.card }}>
        {filtrados.length === 0 ? (
          <div className="grid min-h-[140px] place-items-center text-[13px]" style={{ color: C.ink3 }}>Nenhum lead rastreado no período com esse filtro.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: C.ink3 }}>
                <th className="px-4 py-2.5 font-semibold">Lead</th>
                <th className="px-4 py-2.5 font-semibold">Origem</th>
                <th className="px-4 py-2.5 font-semibold">Campanha</th>
                <th className="px-4 py-2.5 text-right font-semibold">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, 200).map((l) => (
                <tr key={l.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: C.ink }}>{l.nome}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-[6px] px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(0,168,132,0.10)', color: C.tealDark }}>{ORIGEM_LABEL[l.bucket]}</span>
                  </td>
                  <td className="px-4 py-2.5" style={{ color: C.ink2 }}>{l.campanha || '—'}</td>
                  <td className="px-4 py-2.5 text-right" style={{ color: C.ink3 }}>{data(l.criado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Card({ label, valor, ativo, onClick, destaque }: { label: string; valor: number; ativo: boolean; onClick: () => void; destaque?: boolean }) {
  return (
    <button onClick={onClick} className="rounded-[12px] border p-[12px_14px] text-left transition-colors"
      style={{ background: C.card, borderColor: ativo ? C.teal : C.line, boxShadow: ativo ? '0 0 0 1px #00a884' : 'none' }}>
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: destaque ? C.tealDark : C.ink3 }}>{label}</div>
      <div className="mt-1 text-[20px] font-bold leading-none tracking-[-0.03em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>{valor}</div>
    </button>
  )
}
