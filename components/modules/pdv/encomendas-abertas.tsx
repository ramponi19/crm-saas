'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Check, MessageCircle, PackageCheck, Pencil, Truck } from 'lucide-react'
import { Badge, Button, EmptyState, Input, notify } from '@/components/ui'
import { diagnosticar, ordenarPorUrgencia, finalizarEncomenda } from '@/lib/encomendas'
import { formatCurrency } from '@/lib/utils'

/**
 * AS ENCOMENDAS EM ABERTO, no lugar onde o vendedor já está.
 *
 * ══ POR QUE ISTO EXISTE ════════════════════════════════════════════════════
 *
 * A JM tinha três encomendas paradas há 28, 21 e 1 dia. Nenhuma recebida. Uma
 * delas prometia "Entregar hoje" — num texto livre escrito em 21/08. O fluxo
 * funcionava; o que faltava era alguém olhar, e nenhuma tela pedia para ser
 * olhada: as pendências moravam em Compras e Histórico, telas em que ninguém
 * entra no meio de um atendimento.
 *
 * Aqui elas ficam do lado de onde a venda acontece, ordenadas pelo que precisa
 * de gente primeiro.
 */

export interface EncomendaPDV {
  id: number
  cliente_nome: string
  cliente_telefone: string | null
  produto_nome: string
  valor_venda: number
  valor_custo: number
  previsao_entrega: string | null
  status: string
  unidade_id: number | null
  lancada_em: string | null
  pedido_id: number | null
  status_pedido: string | null
  tem_fornecedor: boolean
  sinal_pago: number
}

const soDigitos = (t: string | null) => (t || '').replace(/\D/g, '')
const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : null

export function EncomendasAbertas({ encomendas }: { encomendas: EncomendaPDV[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [editando, setEditando] = useState<number | null>(null)

  /**
   * `hoje` fixado no primeiro render.
   *
   * `new Date()` dentro do `useMemo` seria uma leitura nova a cada render — e
   * dois renders na virada da meia-noite dariam diagnósticos diferentes para a
   * mesma lista. Um PDV fica aberto a noite inteira no balcão.
   */
  const [hoje] = useState(() => new Date())
  const ordenadas = useMemo(() => ordenarPorUrgencia(encomendas, hoje), [encomendas, hoje])

  const atrasadas = ordenadas.filter((e) => diagnosticar(e, hoje).situacao === 'atrasada').length
  const chegaram = ordenadas.filter((e) => diagnosticar(e, hoje).situacao === 'chegou').length

  /** A peça chegou: dá entrada no estoque, já reservada para este cliente. */
  async function receber(e: EncomendaPDV) {
    if (!e.pedido_id) {
      notify.bad('Encomenda sem pedido de compra', 'Não dá para dar entrada sem o pedido. Confira em Compras.')
      return
    }
    setOcupado(e.id)
    const r = await fetch('/api/compras/receber', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId: e.pedido_id }),
    })
    setOcupado(null)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad('Não deu para registrar a chegada', j.error); return }
    notify.ok('Chegou', `Reservado para ${e.cliente_nome}. Avise que está na loja.`)
    router.refresh()
  }

  /** Entrega: conclui a venda e baixa a unidade. Regra em lib/encomendas. */
  async function entregar(e: EncomendaPDV) {
    setOcupado(e.id)
    const r = await finalizarEncomenda(supabase, e.id)
    setOcupado(null)
    if (!r.ok) { notify.bad('Erro ao finalizar', r.erro); return }
    const falta = Math.max(0, e.valor_venda - e.sinal_pago)
    notify.ok(
      'Venda concluída',
      falta > 0.005
        ? `Receba ${formatCurrency(falta)} do cliente.`
        : r.baixouEstoque ? 'Unidade baixada do estoque.' : 'Contabilizada no faturamento.',
    )
    router.refresh()
  }

  /**
   * AJUSTAR O QUE FALTA, SEM SAIR DAQUI.
   *
   * A lista aponta "sem custo" e "sem prazo" — apontar sem oferecer o conserto é
   * o mesmo que não apontar: ninguém vai até Histórico para editar uma venda
   * pendente. Os três campos aqui são exatamente os que a encomenda pode ter
   * nascido errados: o preço (uma real da JM saiu com R$ 7,60 num Pro Max — um
   * dígito fora do lugar), o custo e o prazo.
   *
   * O custo vai junto para o pedido de compra: são o mesmo número visto de dois
   * lados, e deixar um só atualizado seria criar a divergência que ninguém acha.
   */
  async function salvarAjuste(e: EncomendaPDV, venda: string, custo: string, prazo: string) {
    const vVenda = Number(venda)
    if (!(vVenda > 0)) { notify.warn('O valor da venda precisa ser maior que zero'); return }
    const vCusto = Number(custo) || 0
    setOcupado(e.id)
    const { error } = await supabase.from('vendas')
      .update({ valor_venda: vVenda, valor_custo: vCusto, previsao_entrega: prazo || null } as never)
      .eq('id', e.id)
    if (!error && e.pedido_id && vCusto > 0) {
      await supabase.from('pedidos_compra').update({ valor_total: vCusto } as never).eq('id', e.pedido_id)
    }
    setOcupado(null)
    if (error) { notify.bad('Não deu para salvar', error.message); return }
    notify.ok('Encomenda atualizada')
    setEditando(null)
    router.refresh()
  }

  function avisar(e: EncomendaPDV) {
    const d = soDigitos(e.cliente_telefone)
    if (!d) { notify.warn('Cliente sem telefone', 'Cadastre o contato para avisar por WhatsApp.'); return }
    const num = d.length <= 11 ? '55' + d : d
    const msg = `Olá, ${e.cliente_nome}! Seu ${e.produto_nome} chegou na loja. Pode vir buscar!`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (encomendas.length === 0) {
    return (
      <div className="pt-6">
        <EmptyState
          icon={<Truck size={22} strokeWidth={1.7} />}
          title="Nenhuma encomenda em aberto"
          description="Encomenda é produto que a loja vende antes de ter. Lance uma acima e ela aparece aqui até ser entregue."
        />
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold tracking-[0.04em] text-ink-2">EM ABERTO</span>
        <span className="text-[12px] text-ink-3">{encomendas.length}</span>
        {atrasadas > 0 && <Badge tone="bad" dot>{atrasadas} atrasada{atrasadas > 1 ? 's' : ''}</Badge>}
        {chegaram > 0 && <Badge tone="ok" dot>{chegaram} para entregar</Badge>}
      </div>

      {ordenadas.map((e) => {
        const d = diagnosticar(e, hoje)
        const falta = Math.max(0, e.valor_venda - e.sinal_pago)
        const chegou = d.situacao === 'chegou'
        return (
          <div
            key={e.id}
            className={`rounded-card border bg-card p-3.5 ${d.situacao === 'atrasada' ? 'border-bad/30' : 'border-line'}`}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className={`grid h-9 w-9 flex-none place-items-center rounded-control ${
                d.situacao === 'atrasada' ? 'bg-bad-soft text-bad' : chegou ? 'bg-ok-soft text-ok' : 'bg-accent-soft text-accent'
              }`}>
                {d.situacao === 'atrasada' ? <AlertTriangle size={17} strokeWidth={1.8} /> : <Truck size={17} strokeWidth={1.8} />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13.5px] font-semibold text-ink">{e.cliente_nome}</span>
                  <span className="truncate text-[13px] text-ink-2">· {e.produto_nome}</span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
                  <Badge tone={d.tom}>{d.rotulo}</Badge>
                  {e.previsao_entrega && !chegou && (
                    <span className="text-ink-3">prometido {dataBR(e.previsao_entrega)}</span>
                  )}
                  <span className="num text-ink-2">{formatCurrency(e.valor_venda)}</span>
                  {e.sinal_pago > 0.005 && (
                    <span className="num text-ok">sinal {formatCurrency(e.sinal_pago)} pago</span>
                  )}
                  {falta > 0.005 && e.sinal_pago > 0.005 && (
                    <span className="num text-ink-3">falta {formatCurrency(falta)}</span>
                  )}
                </div>

                {/**
                  * O QUE ESTÁ FALTANDO, DITO NA CARA.
                  *
                  * As três encomendas reais da JM estavam com custo zero — e o
                  * relatório mostrava 100% de margem num aparelho que a loja
                  * ainda ia pagar. O aviso na hora de lançar não bastou, porque
                  * some. Aqui ele fica, até alguém resolver.
                  */}
                {(e.valor_custo <= 0 || !e.tem_fornecedor) && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-warn">
                    {e.valor_custo <= 0 && <span>⚠ sem custo — o lucro aparece como 100%</span>}
                    {!e.tem_fornecedor && <span>⚠ sem fornecedor</span>}
                  </div>
                )}
              </div>

              <div className="flex flex-none flex-wrap items-center gap-1.5">
                <button type="button" title="Ajustar valores e prazo"
                  onClick={() => setEditando(editando === e.id ? null : e.id)}
                  className="grid h-8 w-8 place-items-center rounded-control border border-line bg-card text-ink-3 transition-colors hover:text-ink">
                  <Pencil size={13} strokeWidth={1.8} />
                </button>
                {chegou ? (
                  <>
                    {e.cliente_telefone && (
                      <Button size="sm" variant="outline" icon={<MessageCircle size={13} strokeWidth={1.8} />}
                        onClick={() => avisar(e)}>Avisar</Button>
                    )}
                    <Button size="sm" loading={ocupado === e.id} icon={<Check size={13} strokeWidth={2} />}
                      onClick={() => entregar(e)}>Entregar</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" loading={ocupado === e.id}
                    icon={<PackageCheck size={13} strokeWidth={1.8} />}
                    onClick={() => receber(e)}>Chegou</Button>
                )}
              </div>
            </div>

            {editando === e.id && (
              <AjusteInline
                key={`ajuste-${e.id}`}
                encomenda={e}
                salvando={ocupado === e.id}
                onCancelar={() => setEditando(null)}
                onSalvar={(venda, custo, prazo) => salvarAjuste(e, venda, custo, prazo)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Os três campos que a encomenda pode ter nascido errados. */
function AjusteInline({ encomenda, salvando, onSalvar, onCancelar }: {
  encomenda: EncomendaPDV
  salvando: boolean
  onSalvar: (venda: string, custo: string, prazo: string) => void
  onCancelar: () => void
}) {
  const [venda, setVenda] = useState(String(encomenda.valor_venda || ''))
  const [custo, setCusto] = useState(encomenda.valor_custo > 0 ? String(encomenda.valor_custo) : '')
  const [prazo, setPrazo] = useState(encomenda.previsao_entrega?.slice(0, 10) ?? '')

  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Venda (R$)" type="number" value={venda} onChange={(ev) => setVenda(ev.target.value)} />
        <Input label="Custo (R$)" type="number" value={custo} onChange={(ev) => setCusto(ev.target.value)} placeholder="0,00" />
        <Input label="Prazo prometido" type="date" value={prazo} onChange={(ev) => setPrazo(ev.target.value)} />
      </div>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button size="sm" loading={salvando} onClick={() => onSalvar(venda, custo, prazo)}>Salvar</Button>
      </div>
    </div>
  )
}
