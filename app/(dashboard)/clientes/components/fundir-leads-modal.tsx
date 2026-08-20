'use client'

import { useMemo, useState } from 'react'
import { Modal, Button, Input, notify } from '@/components/ui'
import { Search, TriangleAlert, ArrowRight } from 'lucide-react'

/**
 * Fusão de Leads — o assistente de três passos do CRM que o dono usa, com os
 * mesmos dizeres: "Selecione o cliente PRINCIPAL (será mantido)", depois o
 * SECUNDÁRIO (será removido), depois a confirmação com o aviso de irreversível.
 *
 * O que acrescentei ao original, porque a fusão é destrutiva:
 *  - busca na lista (a dele mostra todos, e com 300 clientes ninguém acha o par);
 *  - o resumo do passo 3 diz o que VAI SER MOVIDO no nosso modelo, item por item;
 *  - a confirmação exige digitar o nome do secundário. Um clique só, num botão
 *    vermelho ao lado de "Voltar", é perto demais de apagar a pessoa errada.
 */

export interface ClienteFusao {
  id: number
  nome: string
  cpf_cnpj?: string | null
  telefone?: string | null
  email?: string | null
}

export default function FundirLeadsModal({ clientes, onClose, onFundido }: {
  clientes: ClienteFusao[]
  onClose: () => void
  onFundido: (resumo: string) => void
}) {
  const [passo, setPasso] = useState<1 | 2 | 3>(1)
  const [principal, setPrincipal] = useState<ClienteFusao | null>(null)
  const [secundario, setSecundario] = useState<ClienteFusao | null>(null)
  const [busca, setBusca] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [fundindo, setFundindo] = useState(false)

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const digitos = q.replace(/\D/g, '')
    return clientes
      .filter((c) => (passo === 1 ? true : c.id !== principal?.id))
      .filter((c) => {
        if (!q) return true
        return c.nome.toLowerCase().includes(q)
          || (c.email ?? '').toLowerCase().includes(q)
          || (digitos.length >= 3 && (c.cpf_cnpj ?? '').replace(/\D/g, '').includes(digitos))
          || (digitos.length >= 3 && (c.telefone ?? '').replace(/\D/g, '').includes(digitos))
      })
  }, [clientes, busca, passo, principal])

  async function confirmar() {
    if (!principal || !secundario) return
    setFundindo(true)
    const r = await fetch('/api/clientes/fundir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal: principal.id, secundario: secundario.id }),
    })
    const j = await r.json().catch(() => ({}))
    setFundindo(false)
    if (!r.ok) { notify.bad('Não foi possível fundir', j?.error); return }
    const m = (j?.movidos ?? {}) as Record<string, number | boolean>
    const partes = [
      m.mensagens ? `${m.mensagens} mensagem(ns)` : null,
      m.chamadas ? `${m.chamadas} ligação(ões)` : null,
      m.vendas ? `${m.vendas} venda(s)` : null,
      m.negocios ? `${m.negocios} negócio(s)` : null,
      m.compromissos ? `${m.compromissos} compromisso(s)` : null,
    ].filter(Boolean)
    onFundido(partes.length ? `Movido: ${partes.join(' · ')}` : 'Cadastros unificados')
  }

  const podeConfirmar = confirmacao.trim().toLowerCase() === (secundario?.nome ?? '').trim().toLowerCase()

  return (
    <Modal
      open
      onClose={() => { if (!fundindo) onClose() }}
      size="lg"
      disableOverlayClose={fundindo}
      title={
        <span className="block">
          <span className="block text-[15px] font-bold text-ink">Fusão de Leads</span>
          <span className="block text-[11.5px] font-normal text-ink-3">
            Unifique registros duplicados mantendo o histórico completo
          </span>
        </span>
      }
      footer={
        passo === 3 ? (
          <>
            <Button variant="ghost" onClick={() => { setPasso(2); setConfirmacao('') }} disabled={fundindo}>Voltar</Button>
            <Button onClick={confirmar} loading={fundindo} disabled={!podeConfirmar}>Confirmar Fusão</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        )
      }
    >
      <div className="space-y-3">
        {/* Trilha dos passos, como no original. */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <span key={n} className="flex items-center gap-2">
              <span className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${
                passo === n ? 'bg-ink text-white' : passo > n ? 'bg-ok-soft text-ok' : 'bg-ink/[0.06] text-ink-3'
              }`}>{n}</span>
              {n < 3 && <ArrowRight size={13} strokeWidth={1.8} className="text-ink-3" />}
            </span>
          ))}
        </div>

        {passo < 3 && (
          <>
            <div className="text-[13px] font-semibold text-ink">
              {passo === 1
                ? '1. Selecione o cliente PRINCIPAL (será mantido)'
                : '2. Selecione o cliente SECUNDÁRIO (será removido)'}
            </div>

            {passo === 2 && principal && (
              <Selecionado rotulo="PRINCIPAL (será mantido)" cliente={principal} tom="ok" />
            )}

            <Input
              icon={<Search size={15} strokeWidth={1.7} />}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF, telefone ou e-mail…"
            />

            <div className="max-h-[280px] overflow-y-auto rounded-control border border-line scrollbar-thin">
              {lista.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-ink-3">Nenhum cliente encontrado.</p>
              ) : (
                <div className="divide-y divide-line-soft">
                  {lista.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        if (passo === 1) { setPrincipal(c); setPasso(2); setBusca('') }
                        else { setSecundario(c); setPasso(3) }
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-ink">{c.nome}</span>
                        <span className="num block truncate text-[11.5px] text-ink-3">
                          {c.cpf_cnpj ? `CPF: ${c.cpf_cnpj}` : 'sem CPF'}
                          {c.telefone ? ` · ${c.telefone}` : ''}
                          {c.email ? ` · ${c.email}` : ''}
                        </span>
                      </span>
                      <ArrowRight size={14} strokeWidth={1.8} className="shrink-0 text-ink-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {passo === 3 && principal && secundario && (
          <>
            <Selecionado rotulo="PRINCIPAL (será mantido)" cliente={principal} tom="ok" />
            <Selecionado rotulo="SECUNDÁRIO (será removido)" cliente={secundario} tom="bad" />

            <div className="rounded-control border border-bad/30 bg-bad-soft p-3">
              <div className="flex items-center gap-2 text-[13px] font-bold text-bad">
                <TriangleAlert size={15} strokeWidth={1.9} />Atenção: esta ação é irreversível!
              </div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">
                Tudo que pertence a <strong>{secundario.nome}</strong> passa para{' '}
                <strong>{principal.nome}</strong>: conversas, ligações, transferências, compromissos,
                orçamentos, propostas, vendas, contratos, cobranças e negócios — mais a etapa do funil,
                quando o principal ainda não estiver nele. Campo vazio do principal é completado com o
                do duplicado; campo preenchido não é sobrescrito. O registro secundário é removido em
                definitivo.
              </p>
            </div>

            {/*
              Digitar o nome é a trava.
              No original, "Confirmar Fusão" fica a um clique de "Voltar" — e o custo
              de errar aqui é apagar a pessoa errada, sem desfazer.
            */}
            <Input
              label={`Para confirmar, digite o nome do cliente que será removido`}
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder={secundario.nome}
              hint={podeConfirmar ? 'Confere.' : 'O nome precisa bater exatamente.'}
            />
          </>
        )}
      </div>
    </Modal>
  )
}

function Selecionado({ rotulo, cliente, tom }: { rotulo: string; cliente: ClienteFusao; tom: 'ok' | 'bad' }) {
  const cor = tom === 'ok' ? 'border-ok/30 bg-ok-soft' : 'border-bad/30 bg-bad-soft'
  const corTexto = tom === 'ok' ? 'text-ok' : 'text-bad'
  return (
    <div className={`rounded-control border p-2.5 ${cor}`}>
      <div className={`text-[10.5px] font-bold uppercase tracking-[0.05em] ${corTexto}`}>{rotulo}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-ink">{cliente.nome}</div>
      <div className="num text-[11.5px] text-ink-3">{cliente.cpf_cnpj ? `CPF: ${cliente.cpf_cnpj}` : 'sem CPF'}</div>
    </div>
  )
}
