'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { AlertTriangle, Check, MessageCircle, PackageCheck, Pencil, ShoppingCart, Truck } from 'lucide-react'
import { Badge, Button, EmptyState, Input, notify } from '@/components/ui'
import { diagnosticar, ordenarPorUrgencia, agruparPorEncomenda, ETAPAS, indiceEtapa, type Etapa } from '@/lib/encomendas'
import { formatCurrency } from '@/lib/utils'
import { type Taxa } from '@/lib/pdv-pagamentos'
import type { DocumentoDisponivel } from '@/lib/contrato-emitir'
import { EncomendaFechar } from './encomenda-fechar'

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
  /** Quando o aparelho foi pedido ao fornecedor. Nulo = ninguem pediu ainda. */
  solicitado_em: string | null
  /** Aparelhos que o cliente entregou como entrada — amarrados pelo grupo. */
  trocas: { descricao: string; imei: string | null; valor: number }[]
  cliente_id: number | null
  grupo_pdv: string | null
}

/** Uma encomenda na tela: os itens somados, com a lista por dentro. */
interface Encomenda extends EncomendaPDV {
  itens: EncomendaPDV[]
}

/**
 * OS ITENS VIRAM UMA ENCOMENDA SÓ.
 *
 * Cada item é uma venda própria no banco — é o que deixa um aparelho chegar
 * antes do outro. Na tela isso vira um card, porque o cliente encomendou UMA
 * vez: três linhas soltas do mesmo nome fariam parecer três pendências.
 *
 * ⚠️ O ESTADO DO GRUPO É O DO ITEM MENOS ADIANTADO. Uma encomenda de três
 * aparelhos com dois na loja ainda não é "chegou" — entregar assim mandaria o
 * cliente embora sem um dos produtos. Só quando o último chega é que a
 * encomenda chegou.
 */
function juntar(itens: EncomendaPDV[]): Encomenda {
  const base = itens[0]
  const soma = (f: (i: EncomendaPDV) => number) => itens.reduce((s, i) => s + f(i), 0)
  const todos = (f: (i: EncomendaPDV) => boolean) => itens.every(f)
  return {
    ...base,
    valor_venda: soma((i) => i.valor_venda),
    valor_custo: soma((i) => i.valor_custo),
    sinal_pago: soma((i) => i.sinal_pago),
    produto_nome: itens.length === 1 ? base.produto_nome : `${itens.length} produtos`,
    status_pedido: todos((i) => i.status_pedido === 'recebido') ? 'recebido' : null,
    unidade_id: todos((i) => i.unidade_id != null) ? base.unidade_id : null,
    solicitado_em: todos((i) => !!i.solicitado_em) ? base.solicitado_em : null,
    tem_fornecedor: todos((i) => i.tem_fornecedor),
    // A troca e do grupo, nao do item: todos carregam a mesma lista.
    trocas: base.trocas,
    // O prazo do grupo é o mais apertado: é por ele que a encomenda atrasa.
    previsao_entrega: itens.map((i) => i.previsao_entrega).filter(Boolean).sort()[0] ?? null,
    itens,
  }
}

const ROTULO_ETAPA: Record<Etapa, string> = {
  lancada: 'Lançada', solicitada: 'Pedido', chegou: 'Chegou', entregue: 'Entregue',
}

/**
 * A TRILHA — onde esta encomenda está, sem ninguém precisar perguntar.
 *
 * Antes da etapa "Pedido" existir, uma encomenda parada há 32 dias era
 * indistinguível de uma pedida ontem: o vendedor não sabia se cobrava o dono ou
 * se só esperava o fornecedor. A bolinha preenchida responde isso de longe.
 */
function Trilha({ e }: { e: Encomenda }) {
  const atual = indiceEtapa(e)
  return (
    <div className="mt-2.5 flex items-start">
      {ETAPAS.map((etapa, i) => {
        const feita = i <= atual
        const quando = etapa === 'solicitada' && e.solicitado_em ? dataBR(e.solicitado_em) : null
        return (
          <Fragment key={etapa}>
            {i > 0 && (
              <div className={`mt-[5px] h-[2px] flex-1 ${i <= atual ? 'bg-ok' : 'bg-line'}`} />
            )}
            <div className="flex flex-col items-center gap-1" style={{ minWidth: 58 }}>
              <span className={`h-[11px] w-[11px] rounded-full border-2 ${
                feita ? 'border-ok bg-ok' : 'border-line bg-card'}`} />
              <span className={`text-[10px] leading-none ${feita ? 'font-semibold text-ink-2' : 'text-ink-3'}`}>
                {ROTULO_ETAPA[etapa]}
              </span>
              {quando && <span className="num text-[9.5px] leading-none text-ink-3">{quando}</span>}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

const soDigitos = (t: string | null) => (t || '').replace(/\D/g, '')
const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : null

export function EncomendasAbertas({ encomendas, taxas = [], isAdmin = false, documentos = [] }: {
  encomendas: EncomendaPDV[]; taxas?: Taxa[]; isAdmin?: boolean; documentos?: DocumentoDisponivel[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [entregando, setEntregando] = useState<number | null>(null)

  /**
   * `hoje` fixado no primeiro render.
   *
   * `new Date()` dentro do `useMemo` seria uma leitura nova a cada render — e
   * dois renders na virada da meia-noite dariam diagnósticos diferentes para a
   * mesma lista. Um PDV fica aberto a noite inteira no balcão.
   */
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [vendedor, setVendedor] = useState<string | null>(null)
  /** Empresa e vendedor: o fechamento precisa dos dois para gravar e assinar. */
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const emp = await empresaAtualId(supabase)
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = user
        ? await supabase.from('usuarios').select('nome').eq('id', user.id).maybeSingle()
        : { data: null }
      if (!vivo) return
      setEmpresaId(emp ?? null)
      setVendedor(data?.nome ?? user?.email ?? null)
    })()
    return () => { vivo = false }
  }, [supabase])

  const [hoje] = useState(() => new Date())
  // Agrupa ANTES de ordenar: a urgencia e da encomenda, nao do item solto.
  const ordenadas = useMemo(
    () => ordenarPorUrgencia(agruparPorEncomenda(encomendas).map((g) => juntar(g.itens)), hoje),
    [encomendas, hoje],
  )

  const atrasadas = ordenadas.filter((e) => diagnosticar(e, hoje).situacao === 'atrasada').length
  const chegaram = ordenadas.filter((e) => diagnosticar(e, hoje).situacao === 'chegou').length

  /**
   * A peça chegou: dá entrada no estoque, já reservada para este cliente.
   *
   * Roda item a item — cada um tem seu pedido de compra, e é isso que permite
   * receber uma encomenda de três aparelhos quando os três chegam juntos, que é
   * o caso comum, sem impedir o dia em que chegarem separados.
   *
   * Item já recebido é pulado pelo próprio endpoint (`jaRecebido`), então
   * apertar de novo não cria unidade duplicada.
   */
  async function receber(e: Encomenda) {
    const pendentes = e.itens.filter((i) => i.pedido_id && i.status_pedido !== 'recebido')
    if (pendentes.length === 0) {
      notify.bad('Encomenda sem pedido de compra', 'Não dá para dar entrada sem o pedido. Confira em Compras.')
      return
    }
    setOcupado(e.id)
    let ok = 0; let erro: string | null = null
    for (const item of pendentes) {
      const r = await fetch('/api/compras/receber', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId: item.pedido_id }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) ok++
      else if (!erro) erro = j.error ?? 'falha ao dar entrada'
    }
    setOcupado(null)
    if (ok === 0) { notify.bad('Não deu para registrar a chegada', erro ?? undefined); return }
    if (erro) {
      notify.warn(`${ok} de ${pendentes.length} itens deram entrada`, `O restante falhou: ${erro}`)
    } else {
      notify.ok('Chegou', `Reservado para ${e.cliente_nome}. Avise que está na loja.`)
    }
    router.refresh()
  }

  /**
   * "PEDIDO FEITO" — o dono marca que encomendou o aparelho ao fornecedor.
   *
   * É a etapa que faltava no ciclo: sem ela, uma encomenda parada há 32 dias
   * era indistinguível de uma pedida ontem, e o vendedor não sabia se cobrava o
   * dono ou se só esperava. Fica gravado QUEM marcou e QUANDO.
   *
   * `is('solicitado_em', null)` no filtro: marcar de novo trocaria a data do
   * pedido original, que é justamente a que interessa para cobrar o fornecedor.
   */
  async function marcarSolicitado(e: Encomenda) {
    const ids = e.itens.map((i) => i.pedido_id).filter((x): x is number => x != null)
    if (ids.length === 0) {
      notify.bad('Encomenda sem pedido de compra', 'Confira em Compras.')
      return
    }
    setOcupado(e.id)
    const { data: { user } } = await supabase.auth.getUser()
    // Todos os itens de uma vez: o dono liga para o fornecedor e pede a
    // encomenda inteira — cobrar um clique por aparelho seria atrito à toa.
    const { error } = await supabase.from('pedidos_compra')
      .update({ solicitado_em: new Date().toISOString(), solicitado_por: user?.id ?? null } as never)
      .in('id', ids)
      .is('solicitado_em', null)
    setOcupado(null)
    if (error) { notify.bad('Não deu para marcar', error.message); return }
    notify.ok('Pedido registrado',
      `${e.produto_nome} — a equipe já vê que ${ids.length > 1 ? 'foram encomendados' : 'foi encomendado'}.`)
    router.refresh()
  }

  /**
   * Entrega: recebe o saldo, conclui a venda e baixa a unidade.
   *
   * O recebimento vai junto porque é aqui que o dinheiro entra de verdade — e
   * até 15/09/2026 ele não era gravado em lugar nenhum: 11 encomendas
   * entregues, R$ 84.540, todas sem uma linha em `vendas_pagamentos`.
   */
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
  async function salvarAjuste(
    e: Encomenda,
    linhas: { id: number; venda: string; custo: string }[],
    prazo: string,
  ) {
    if (linhas.some((l) => !(Number(l.venda) > 0))) {
      notify.warn('Cada item precisa de um valor maior que zero')
      return
    }
    setOcupado(e.id)
    let erro: string | null = null
    for (const l of linhas) {
      const vCusto = Number(l.custo) || 0
      const { error } = await supabase.from('vendas')
        .update({ valor_venda: Number(l.venda), valor_custo: vCusto, previsao_entrega: prazo || null } as never)
        .eq('id', l.id)
      if (error) { erro = error.message; break }
      // O custo vai junto para o pedido de compra do MESMO item: são o mesmo
      // número visto de dois lados, e deixar um só atualizado cria a
      // divergência que ninguém acha depois.
      const pedido = e.itens.find((i) => i.id === l.id)?.pedido_id
      if (pedido && vCusto > 0) {
        await supabase.from('pedidos_compra').update({ valor_total: vCusto } as never).eq('id', pedido)
      }
    }
    setOcupado(null)
    if (erro) { notify.bad('Não deu para salvar', erro); return }
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
        <span className="text-[12px] text-ink-3">{ordenadas.length}</span>
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
                  {e.itens.length > 1 && (
                    <Badge tone="acc">{e.itens.length} itens</Badge>
                  )}
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
                {/**
                  * O QUE O CLIENTE ENTREGOU NA ENTRADA.
                  *
                  * O aparelho abateu do total e está no estoque amarrado a esta
                  * encomenda. Mostrar aqui é o que permite conferir na frente do
                  * cliente — "o senhor deixou o 13, certo?" — sem abrir Estoque.
                  */}
                {e.trocas.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11.5px]">
                    <span className="font-semibold text-ok">Entrada em aparelho:</span>
                    {e.trocas.map((t, i) => (
                      <span key={i} className="text-ink-2">
                        {t.descricao}
                        {t.imei && <span className="num text-ink-3"> · {t.imei}</span>}
                        <span className="num"> · {formatCurrency(t.valor)}</span>
                        {i < e.trocas.length - 1 && <span className="text-ink-3">;</span>}
                      </span>
                    ))}
                  </div>
                )}

                {/* Os itens, quando são mais de um: cada linha com o que falta
                    nela, porque um aparelho pode ter chegado e o outro não. */}
                {e.itens.length > 1 && (
                  <ul className="mt-2 space-y-1 border-l-2 border-line-soft pl-2.5">
                    {e.itens.map((i) => {
                      const chegouItem = i.status_pedido === 'recebido' || i.unidade_id != null
                      return (
                        <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                          <span className={chegouItem ? 'text-ink-2' : 'text-ink-3'}>{i.produto_nome}</span>
                          <span className="num text-ink-3">{formatCurrency(i.valor_venda)}</span>
                          {chegouItem
                            ? <span className="text-[10.5px] font-semibold text-ok">na loja</span>
                            : <span className="text-[10.5px] text-ink-3">{i.solicitado_em ? 'pedido' : 'a pedir'}</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}

                <Trilha e={e} />
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
                      onClick={() => setEntregando(entregando === e.id ? null : e.id)}>Entregar</Button>
                  </>
                ) : (
                  <>
                    {/* Só quem compra marca que pediu — mas todo mundo vê na trilha. */}
                    {isAdmin && !e.solicitado_em && (
                      <Button size="sm" variant="outline" loading={ocupado === e.id}
                        icon={<ShoppingCart size={13} strokeWidth={1.8} />}
                        onClick={() => marcarSolicitado(e)}>Pedido feito</Button>
                    )}
                    <Button size="sm" variant="outline" loading={ocupado === e.id}
                      icon={<PackageCheck size={13} strokeWidth={1.8} />}
                      onClick={() => receber(e)}>Chegou</Button>
                  </>
                )}
              </div>
            </div>

            {entregando === e.id && empresaId != null && (
              <EncomendaFechar
                key={`entrega-${e.id}`}
                encomenda={{
                  id: e.id,
                  cliente_nome: e.cliente_nome,
                  clienteId: e.cliente_id,
                  produto_nome: e.produto_nome,
                  valor_venda: e.valor_venda,
                  sinal_pago: e.sinal_pago,
                  grupo_pdv: e.grupo_pdv,
                  itens: e.itens.map((i) => ({
                    id: i.id, produto_nome: i.produto_nome, valor_venda: i.valor_venda,
                  })),
                }}
                taxas={taxas}
                documentos={documentos}
                empresaId={empresaId}
                vendedor={vendedor}
                onCancelar={() => setEntregando(null)}
                onPronto={() => { setEntregando(null); router.refresh() }}
              />
            )}

            {editando === e.id && (
              <AjusteInline
                key={`ajuste-${e.id}`}
                encomenda={e}
                salvando={ocupado === e.id}
                onCancelar={() => setEditando(null)}
                onSalvar={(linhas, prazo) => { void salvarAjuste(e, linhas, prazo) }}
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
  encomenda: Encomenda
  salvando: boolean
  onSalvar: (linhas: { id: number; venda: string; custo: string }[], prazo: string) => void
  onCancelar: () => void
}) {
  const [linhas, setLinhas] = useState(
    encomenda.itens.map((i) => ({
      id: i.id,
      nome: i.produto_nome,
      venda: String(i.valor_venda || ''),
      custo: i.valor_custo > 0 ? String(i.valor_custo) : '',
    })),
  )
  const [prazo, setPrazo] = useState(encomenda.previsao_entrega?.slice(0, 10) ?? '')
  const mexer = (id: number, patch: Partial<{ venda: string; custo: string }>) =>
    setLinhas((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      <div className="space-y-2.5">
        {linhas.map((l) => (
          <div key={l.id}>
            {linhas.length > 1 && (
              <p className="mb-1 truncate text-[11.5px] font-medium text-ink-2">{l.nome}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Input label="Venda (R$)" type="number" value={l.venda}
                onChange={(ev) => mexer(l.id, { venda: ev.target.value })} />
              <Input label="Custo (R$)" type="number" value={l.custo} placeholder="0,00"
                onChange={(ev) => mexer(l.id, { custo: ev.target.value })} />
            </div>
          </div>
        ))}
        <Input label="Prazo prometido" type="date" value={prazo}
          onChange={(ev) => setPrazo(ev.target.value)}
          hint={linhas.length > 1 ? 'Vale para a encomenda inteira.' : undefined} />
      </div>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button size="sm" loading={salvando} onClick={() => onSalvar(linhas, prazo)}>Salvar</Button>
      </div>
    </div>
  )
}
