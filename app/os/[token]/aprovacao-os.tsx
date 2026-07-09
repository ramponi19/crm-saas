'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'

export function AprovacaoOS({ token }: { token: string }) {
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'aprovado' | 'recusado' | 'erro'>('idle')
  const [erro, setErro] = useState('')

  async function responder(acao: 'aprovar' | 'recusar') {
    if (acao === 'recusar' && !window.confirm('Tem certeza que deseja recusar o orçamento?')) return
    setEstado('enviando')
    try {
      const res = await fetch(`/api/os/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Falha ao registrar')
      setEstado(acao === 'aprovar' ? 'aprovado' : 'recusado')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Tente novamente.')
      setEstado('erro')
    }
  }

  if (estado === 'aprovado') return <div className="rounded-control border border-ok/30 bg-ok-soft p-4 text-center text-[14px] font-semibold text-ok">✓ Orçamento aprovado. Obrigado!</div>
  if (estado === 'recusado') return <div className="rounded-control border border-bad/30 bg-bad-soft p-4 text-center text-[14px] font-semibold text-bad">Orçamento recusado.</div>

  return (
    <div className="space-y-2.5">
      {estado === 'erro' && <p className="text-center text-[12.5px] text-bad">{erro}</p>}
      <button
        onClick={() => responder('aprovar')} disabled={estado === 'enviando'}
        className="flex w-full items-center justify-center gap-2 rounded-control bg-ink py-3 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Check size={17} strokeWidth={2} /> {estado === 'enviando' ? 'Enviando…' : 'Aprovar orçamento'}
      </button>
      <button
        onClick={() => responder('recusar')} disabled={estado === 'enviando'}
        className="flex w-full items-center justify-center gap-2 rounded-control border border-line py-3 text-[13.5px] font-medium text-ink-2 transition-colors hover:border-bad/40 hover:text-bad disabled:opacity-50"
      >
        <X size={16} strokeWidth={1.8} /> Recusar
      </button>
    </div>
  )
}
