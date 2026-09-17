'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, FileText, Plus, Trash2 } from 'lucide-react'
import { Button, Input, notify } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { imprimirContratoHTML } from '@/lib/contrato-tipos'
import { emitirContrato, type DocumentoDisponivel, type EmitirContratoInput } from '@/lib/contrato-emitir'
import { parcelasDisponiveis, valorComJuros, type Taxa } from '@/lib/pdv-pagamentos'
import { finalizarEncomenda } from '@/lib/encomendas'

/**
 * FECHAR A ENCOMENDA — o que acontece quando o cliente vem buscar.
 *
 * ══ POR QUE ISTO NÃO É SÓ UM BOTÃO ═════════════════════════════════════════
 *
 * O "Entregar" antigo concluía a venda e pronto. Faltavam três coisas que a
 * venda de balcão sempre teve e a encomenda não:
 *
 *  1. O RECEBIMENTO. As 11 encomendas já entregues da JM somam R$ 84.540 e
 *     nenhuma tinha uma linha de pagamento — o dinheiro não existia no sistema.
 *  2. OS ACESSÓRIOS. "Leva a capinha junto?" é onde a loja ganha margem, e não
 *     havia onde lançar isso sem abrir outra venda.
 *  3. OS DOCUMENTOS. Termo de garantia e contrato, que numa venda de R$ 7.895
 *     não são detalhe.
 *
 * ══ O QUE ESTA TELA NÃO É ══════════════════════════════════════════════════
 *
 * Não é uma cópia do PDV. As regras que valem dinheiro continuam nas libs
 * compartilhadas — `pdv-pagamentos` calcula juros, `contrato-emitir` monta o
 * documento, `encomendas` conclui a venda. Aqui só se juntam as peças.
 */

const FORMAS = [
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'pix', label: 'PIX' },
  { key: 'debito', label: 'Débito' },
  { key: 'credito', label: 'Crédito' },
  { key: 'link', label: 'Link' },
]
/** Só crédito e link parcelam — mesma regra do PDV. */
const PARCELA = new Set(['credito', 'link'])

interface Acessorio { id: string; descricao: string; valor: string }
const acessorioVazio = (): Acessorio => ({ id: `a${Date.now()}${Math.random().toString(36).slice(2, 5)}`, descricao: '', valor: '' })

export interface EncomendaParaFechar {
  id: number
  cliente_nome: string
  clienteId: number | null
  produto_nome: string
  valor_venda: number
  sinal_pago: number
  itens: { id: number; produto_nome: string; valor_venda: number }[]
  grupo_pdv: string | null
}

export function EncomendaFechar({ encomenda, taxas, documentos, empresaId, vendedor, onPronto, onCancelar }: {
  encomenda: EncomendaParaFechar
  taxas: Taxa[]
  documentos: DocumentoDisponivel[]
  empresaId: number
  vendedor: string | null
  onPronto: () => void
  onCancelar: () => void
}) {
  const supabase = createClient()
  const [forma, setForma] = useState('pix')
  const [parcelas, setParcelas] = useState(1)
  const [acessorios, setAcessorios] = useState<Acessorio[]>([])
  const [salvando, setSalvando] = useState(false)
  /** Depois de fechar, a tela vira a lista de documentos a emitir. */
  const [contexto, setContexto] = useState<Omit<EmitirContratoInput, 'documentoId' | 'nomeDocumento'> | null>(null)
  const [emitindo, setEmitindo] = useState<number | null>(null)
  const [emitidos, setEmitidos] = useState<number[]>([])

  const acessoriosValidos = acessorios.filter((a) => a.descricao.trim() && (Number(a.valor) || 0) > 0)
  const totalAcessorios = acessoriosValidos.reduce((s, a) => s + (Number(a.valor) || 0), 0)
  const total = encomenda.valor_venda + totalAcessorios
  const saldo = Math.max(0, total - encomenda.sinal_pago)

  const linha = { id: 'ent', forma, valor: saldo, parcelas, bandeira: 'visa_master' as const }
  const opcoes = parcelasDisponiveis(linha, taxas)
  const comJuros = valorComJuros(linha, taxas)
  const parcela = PARCELA.has(forma)

  /**
   * Fecha a encomenda: acessórios viram venda, cada item conclui a sua, e o
   * dinheiro entra UMA vez.
   *
   * O acessório é uma venda própria no mesmo grupo — é como o PDV faz, e é o que
   * mantém o relatório por produto correto: a capinha não vira "parte do iPhone".
   */
  async function fechar() {
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const vendaIds = encomenda.itens.map((i) => i.id)

    // Acessórios primeiro: se falharem, nada foi concluído ainda.
    for (const a of acessoriosValidos) {
      const { data: vAc, error } = await supabase.from('vendas').insert({
        empresa_id: empresaId,
        grupo_pdv: encomenda.grupo_pdv,
        cliente_id: encomenda.clienteId,
        vendedor_id: user?.id ?? null,
        usuario_id: user?.id ?? null,
        valor_venda: Number(a.valor) || 0,
        valor_custo: 0,
        canal_venda: 'encomenda',
        status: 'concluida',
        data_venda: new Date().toISOString(),
        observacoes: `Acessório: ${a.descricao.trim()}`,
      } as never).select('id').single()
      if (error) {
        setSalvando(false)
        notify.bad('Erro ao lançar o acessório', error.message)
        return
      }
      if (vAc) vendaIds.push((vAc as { id: number }).id)
    }

    // Cada item conclui a sua venda; o recebimento vai só na primeira.
    let falhou: string | null = null
    let pagou = false
    for (const [n, item] of encomenda.itens.entries()) {
      const r = await finalizarEncomenda(supabase, item.id,
        n === 0 && saldo > 0.005 ? { forma, valor: saldo, parcelas: parcela ? parcelas : null, empresaId } : null)
      if (!r.ok) { falhou = r.erro ?? 'erro ao concluir'; break }
      if (n === 0) pagou = r.registrouPagamento
    }
    setSalvando(false)
    if (falhou) { notify.bad('Erro ao finalizar', falhou); return }

    if (saldo > 0.005 && !pagou) {
      notify.warn('Entrega concluída, mas o recebimento não foi gravado',
        `Lance ${formatCurrency(saldo)} manualmente no financeiro.`)
    } else {
      notify.ok('Venda concluída', saldo > 0.005 ? `${formatCurrency(saldo)} recebido em ${forma}.` : 'Contabilizada no faturamento.')
    }

    /**
     * A venda está fechada — agora os documentos.
     *
     * O contexto é montado aqui e não some se a emissão falhar: o papel pode ser
     * tirado de novo, mas a venda não se desfaz.
     */
    setContexto({
      empresaId,
      clienteId: encomenda.clienteId,
      vendaIds,
      itens: [
        ...encomenda.itens.map((i) => ({ descricao: i.produto_nome, imei: null, valor: i.valor_venda, garantia_dias: null })),
        ...acessoriosValidos.map((a) => ({ descricao: a.descricao.trim(), imei: null, valor: Number(a.valor) || 0, garantia_dias: null })),
      ],
      total,
      desconto: 0,
      forma_pagamento: forma,
      parcelas: parcela ? parcelas : null,
      vendedor,
      data: new Date().toISOString(),
    })
  }

  /** Emite o documento escolhido. A venda já está gravada — falhar não a desfaz. */
  async function emitir(doc: DocumentoDisponivel) {
    if (!contexto) return
    setEmitindo(doc.id)
    try {
      const r = await emitirContrato(supabase, { ...contexto, documentoId: doc.id, nomeDocumento: doc.nome })
      setEmitindo(null)
      if (r.bloqueado) { notify.bad('Documento não emitido', r.bloqueado); return }
      if (r.semModelo) { notify.warn(`"${doc.nome}" não tem conteúdo`, 'Monte o documento em Administração → Documentos'); return }
      if (!r.html) { notify.bad('Não foi possível emitir'); return }
      setEmitidos((e) => [...e, doc.id])
      if (!r.salvo) notify.warn('Documento não foi arquivado', 'Dá para imprimir agora, mas não haverá 2ª via no Histórico')
      // Cadastro incompleto imprime espaço em branco calado: avisa ANTES de o
      // papel ir para a mão do cliente.
      if (r.faltando?.length) {
        notify.warn('Documento saiu com campos em branco', 'Falta no cadastro do cliente: ' + r.faltando.join(', ') + '.')
      }
      if (r.faltandoLoja?.length) {
        notify.warn('Falta o cadastro da sua loja', 'O documento pede: ' + r.faltandoLoja.join(', ') + '. Preencha em Administração → Minha empresa.')
      }
      if (!imprimirContratoHTML(r.html)) notify.warn('Permita pop-ups para imprimir')
    } catch (e) {
      setEmitindo(null)
      notify.bad('Erro ao emitir', e instanceof Error ? e.message : undefined)
    }
  }

  // ── Fase 2: a venda fechou, faltam os papéis ──
  if (contexto) {
    return (
      <div className="mt-3 border-t border-line-soft pt-3">
        <div className="mb-2.5 flex items-center gap-2">
          <Check size={15} strokeWidth={2.2} className="text-ok" />
          <span className="text-[13px] font-semibold text-ink">Entregue. Documentos:</span>
        </div>
        {documentos.length === 0 ? (
          <p className="text-[12.5px] text-ink-2">
            Nenhum documento configurado. Monte o termo de garantia e o contrato em
            Administração → Documentos.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {documentos.map((d) => (
              <Button key={d.id} size="sm" variant={emitidos.includes(d.id) ? 'ghost' : 'outline'}
                loading={emitindo === d.id}
                icon={emitidos.includes(d.id)
                  ? <Check size={13} strokeWidth={2} className="text-ok" />
                  : <FileText size={13} strokeWidth={1.8} />}
                onClick={() => emitir(d)}>
                {d.nome}
              </Button>
            ))}
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={onPronto}>Concluir</Button>
        </div>
      </div>
    )
  }

  // ── Fase 1: acessórios e recebimento ──
  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[12.5px] font-semibold text-ink">
          {saldo > 0.005 ? 'Receber na entrega' : 'Nada a receber — já está pago'}
        </span>
        <span className="text-[11.5px] text-ink-3">
          <span className="num">{formatCurrency(encomenda.valor_venda)}</span> da encomenda
          {totalAcessorios > 0 && <> · <span className="num">{formatCurrency(totalAcessorios)}</span> em acessórios</>}
          {encomenda.sinal_pago > 0.005 && <> · <span className="num text-ok">{formatCurrency(encomenda.sinal_pago)}</span> de entrada</>}
        </span>
      </div>

      {/* ACESSÓRIOS: "leva a capinha junto?" é onde a loja ganha margem. */}
      <div className="mb-3">
        {acessorios.map((a) => (
          <div key={a.id} className="mb-2 flex items-center gap-2">
            <Input wrapperClassName="flex-1" placeholder="Acessório (capa, película, fonte…)"
              value={a.descricao}
              onChange={(e) => setAcessorios((xs) => xs.map((x) => x.id === a.id ? { ...x, descricao: e.target.value } : x))} />
            <Input wrapperClassName="w-28" type="number" placeholder="R$"
              value={a.valor}
              onChange={(e) => setAcessorios((xs) => xs.map((x) => x.id === a.id ? { ...x, valor: e.target.value } : x))} />
            <button type="button" aria-label="Remover acessório"
              onClick={() => setAcessorios((xs) => xs.filter((x) => x.id !== a.id))}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-3 transition-colors hover:text-bad">
              <Trash2 size={14} strokeWidth={1.8} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setAcessorios((xs) => [...xs, acessorioVazio()])}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-accent transition-opacity hover:opacity-80">
          <Plus size={13} strokeWidth={2} /> Acessório
        </button>
      </div>

      {saldo > 0.005 && (
        <>
          <div className="mb-2.5 num text-[22px] font-bold tracking-[-0.03em] text-ink">{formatCurrency(saldo)}</div>
          <div className="flex flex-wrap gap-1.5">
            {FORMAS.map((f) => (
              <button key={f.key} type="button" onClick={() => { setForma(f.key); setParcelas(1) }}
                className={`h-8 rounded-control px-3 text-[12px] font-semibold transition-colors ${
                  forma === f.key ? 'bg-ink text-white' : 'border border-line bg-card text-ink-2 hover:bg-line-soft'}`}>
                {f.label}
              </button>
            ))}
          </div>
          {/* Parcelas e juros vêm das taxas cadastradas — as mesmas do PDV. */}
          {parcela && (
            opcoes.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {opcoes.map((n) => (
                  <button key={n} type="button" onClick={() => setParcelas(n)}
                    className={`num h-7 w-10 rounded-control border text-[12px] font-bold transition-colors ${
                      parcelas === n ? 'border-ink/30 bg-ink/[0.06] text-ink' : 'border-line text-ink-2 hover:bg-line-soft'}`}>
                    {n}x
                  </button>
                ))}
                {parcelas > 1 && (
                  <span className="text-[11.5px] text-ink-3">
                    de <span className="num">{formatCurrency(comJuros / parcelas)}</span>
                    {comJuros > saldo + 0.005 && <> · cobra <span className="num">{formatCurrency(comJuros)}</span></>}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11.5px] text-warn">
                Sem taxa cadastrada para esta forma — configure em Administração → Taxas.
              </p>
            )
          )}
        </>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button size="sm" loading={salvando} icon={<Check size={13} strokeWidth={2} />} onClick={fechar}>
          {saldo > 0.005 ? 'Receber e entregar' : 'Confirmar entrega'}
        </Button>
      </div>
    </div>
  )
}
