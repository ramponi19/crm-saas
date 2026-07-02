'use client'

import { useState } from 'react'
import { Zap } from 'lucide-react'
import { toast } from 'sonner'

const GOLD = '#C9A24B'

export function ReguaFollowupCard({ inicialAtivo, isImob }: { inicialAtivo: boolean; isImob: boolean }) {
  const [ativo, setAtivo] = useState(inicialAtivo)
  const [salvando, setSalvando] = useState(false)

  async function alternar() {
    const novo = !ativo
    setAtivo(novo) // otimista
    setSalvando(true)
    try {
      const res = await fetch('/api/admin/regua-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: novo }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Falha ao salvar')
      toast.success(novo ? 'Régua de follow-up ativada' : 'Régua de follow-up desativada')
    } catch (e) {
      setAtivo(!novo) // desfaz
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6">
      <div className="flex items-start gap-4">
        <div className="w-[44px] h-[44px] rounded-[12px] flex items-center justify-center shrink-0" style={{ background: `${GOLD}18`, color: GOLD }}>
          <Zap size={21} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[15px] font-bold text-[#16212E]">Régua de follow-up automática</div>
            {/* switch */}
            <button
              role="switch"
              aria-checked={ativo}
              disabled={salvando}
              onClick={alternar}
              className="relative w-[46px] h-[26px] rounded-full transition-colors shrink-0 disabled:opacity-60"
              style={{ background: ativo ? GOLD : 'rgba(22,33,46,0.18)' }}
            >
              <span
                className="absolute top-[3px] left-[3px] w-[20px] h-[20px] rounded-full bg-white shadow transition-transform"
                style={{ transform: ativo ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
          <p className="text-[12.5px] text-[#788698] mt-1.5 leading-relaxed">
            Cria tarefas de cobrança sozinha: lead novo sem primeiro contato em 24h
            {isImob ? ' e visita realizada sem proposta em 3 dias' : ''}. São tarefas
            internas na equipe — não envia nada para o cliente.
          </p>
          <p className="text-[11.5px] mt-2" style={{ color: ativo ? '#15803D' : '#9AA7B6' }}>
            {ativo ? '● Ativa — roda todo dia de manhã.' : '○ Desativada — nenhuma tarefa automática é criada.'}
          </p>
        </div>
      </div>
    </div>
  )
}
