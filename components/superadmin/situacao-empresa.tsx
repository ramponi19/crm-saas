'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Card, Button, Badge, notify } from '@/components/ui'
import { NOME_SITUACAO, type Situacao } from '@/lib/faturamento'

const PLATFORM = '#6D28D9'

const ACOES: { valor: 'piloto' | 'teste' | 'pagante' | 'cortesia'; rotulo: string; ajuda: string }[] = [
  { valor: 'piloto', rotulo: 'Piloto', ajuda: 'sem cobrança, sem vencimento, fora do MRR' },
  { valor: 'teste', rotulo: 'Teste de 14 dias', ajuda: 'conta a partir de agora; vence e vira só leitura' },
  { valor: 'pagante', rotulo: 'Pagante', ajuda: 'entra no MRR pelo preço do plano' },
  { valor: 'cortesia', rotulo: 'Cortesia', ajuda: 'sem cobrança por acordo, fora do MRR' },
]

/**
 * A situação da empresa em um clique (18/11/2026, piloto): Piloto, Teste, Pagante ou Cortesia — cada botão
 * acerta piloto/cortesia/fim do teste juntos e reativa (/api/superadmin/empresas/[id], ação 'situacao').
 * Demonstração é marca à parte (empresas de exemplo) e não muda aqui.
 */
export function SituacaoEmpresa({ empresaId, atual, demo }: { empresaId: number; atual: Situacao; demo: boolean }) {
  const router = useRouter()
  const [salvando, setSalvando] = useState<string | null>(null)

  async function trocar(situacao: string) {
    setSalvando(situacao)
    const r = await fetch(`/api/superadmin/empresas/${empresaId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'situacao', situacao }),
    })
    const j = await r.json().catch(() => ({}))
    setSalvando(null)
    if (!r.ok) { notify.bad(j.error ?? 'Não foi possível trocar a situação'); return }
    notify.ok('Situação trocada')
    router.refresh()
  }

  return (
    <Card title="Situação">
      <div className="mb-3 flex items-center gap-2 text-[13px] text-ink-2">
        Agora: <Badge tone={atual === 'suspensa' ? 'bad' : atual === 'pagante' ? 'ok' : 'neutro'} data-situacao={atual}>{NOME_SITUACAO[atual]}</Badge>
      </div>
      {demo ? (
        <p className="text-[12.5px] text-ink-3">Empresa de demonstração: a situação não se aplica.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ACOES.map((a) => (
            <Button
              key={a.valor}
              variant="outline"
              disabled={atual === a.valor || salvando !== null}
              loading={salvando === a.valor}
              onClick={() => trocar(a.valor)}
              className="h-auto justify-start py-2 text-left"
              style={atual === a.valor ? { borderColor: PLATFORM } : undefined}
            >
              <span className="flex flex-col">
                <span className="text-[13px] font-semibold text-ink">{a.rotulo}</span>
                <span className="text-[11.5px] font-normal text-ink-3">{a.ajuda}</span>
              </span>
            </Button>
          ))}
        </div>
      )}
    </Card>
  )
}
