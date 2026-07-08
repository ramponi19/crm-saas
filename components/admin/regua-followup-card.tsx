'use client'

import { useState } from 'react'
import { Zap } from 'lucide-react'
import { Card, Badge, notify } from '@/components/ui'
import { cn } from '@/lib/utils'

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
      notify.ok(novo ? 'Régua de follow-up ativada' : 'Régua de follow-up desativada')
    } catch (e) {
      setAtivo(!novo) // desfaz
      notify.bad(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 flex-none place-items-center rounded-control bg-accent-soft text-accent">
          <Zap size={21} strokeWidth={1.7} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[15px] font-semibold text-ink">Régua de follow-up automática</div>
            {/* switch */}
            <button
              role="switch"
              aria-checked={ativo}
              disabled={salvando}
              onClick={alternar}
              className={cn(
                'relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors disabled:opacity-60',
                ativo ? 'bg-accent' : 'bg-ink/20',
              )}
            >
              <span
                className="absolute left-[3px] top-[3px] h-[20px] w-[20px] rounded-full bg-white shadow transition-transform"
                style={{ transform: ativo ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
            Cria tarefas de cobrança sozinha: lead novo sem primeiro contato em 24h
            {isImob ? ' e visita realizada sem proposta em 3 dias' : ''}. São tarefas
            internas na equipe — não envia nada para o cliente.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Badge tone={ativo ? 'ok' : 'neutro'} dot>{ativo ? 'Ativa' : 'Pausada'}</Badge>
            <span className="text-[11.5px] text-ink-3">
              {ativo ? 'Roda todo dia de manhã.' : 'Nenhuma tarefa automática é criada.'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}
