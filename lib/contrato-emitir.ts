// Emissão e recuperação do contrato de venda.
//
// O contrato é EMITIDO UMA VEZ, no fechamento da venda, e arquivado em
// `contratos_venda`. O Histórico não regera nada: busca o documento e imprime.
// Isso resolve dois problemas que a remontagem tinha: a 2ª via saía com o
// cadastro de hoje (não o do dia da assinatura) e, como o PDV grava uma linha
// por item em `vendas`, uma venda de 3 produtos virava 3 contratos de 1 item.

import type { SupabaseClient } from '@supabase/supabase-js'
import { gerarContratoHTML, type ContratoItem, type ContratoComprador, type DadosContrato } from './contrato-venda'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>

/** Usado quando a loja não configurou nada em /admin/configuracoes. */
export const GARANTIA_PADRAO_DIAS = 90

const CAMPOS_COMPRADOR =
  'nome, cpf_cnpj, nacionalidade, estado_civil, profissao, data_nascimento, telefone, endereco, numero, complemento, bairro, cidade, estado, cep'

const COMPRADOR_VAZIO: ContratoComprador = {
  nome: '', cpf_cnpj: null, nacionalidade: null, estado_civil: null, profissao: null,
  data_nascimento: null, telefone: null, endereco: null, numero: null, complemento: null,
  bairro: null, cidade: null, estado: null, cep: null,
}

/** Garantia padrão da loja (configuracoes_sistema → chave `contrato`). */
export async function garantiaPadraoLoja(supabase: Client, empresaId: number): Promise<number> {
  const { data } = await supabase
    .from('configuracoes_sistema')
    .select('valor').eq('empresa_id', empresaId).eq('chave', 'contrato').maybeSingle()
  const n = Number((data?.valor as { garantia_dias?: unknown } | null)?.garantia_dias)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : GARANTIA_PADRAO_DIAS
}

export interface EmitirContratoInput {
  empresaId: number
  clienteId: number | null
  /** Todas as linhas de `vendas` desta venda — é o que amarra o contrato a ela. */
  vendaIds: number[]
  itens: ContratoItem[]
  total: number
  desconto?: number
  forma_pagamento: string | null
  parcelas?: number | null
  vendedor?: string | null
  /** ISO da venda; default: agora. */
  data?: string
  criadoPor?: string | null
}

export interface ContratoEmitido {
  html: string
  /** false = o documento foi montado mas não chegou ao banco (não haverá 2ª via). */
  salvo: boolean
}

/**
 * Monta o contrato com os dados do momento e arquiva.
 *
 * Nunca lança: a venda já aconteceu quando isto roda, e falhar aqui não pode
 * derrubar o fechamento. Se a gravação falhar, devolve o HTML mesmo assim para
 * o operador conseguir imprimir na hora — com `salvo: false` para quem chamou
 * poder avisar que a 2ª via não vai existir.
 */
export async function emitirContrato(supabase: Client, input: EmitirContratoInput): Promise<ContratoEmitido> {
  const [empRes, cliRes, garantiaLoja] = await Promise.all([
    supabase.from('empresas').select('nome, cnpj, telefone, wl_logo_url').eq('id', input.empresaId).maybeSingle(),
    input.clienteId
      ? supabase.from('clientes').select(CAMPOS_COMPRADOR).eq('id', input.clienteId).maybeSingle()
      : Promise.resolve({ data: null }),
    garantiaPadraoLoja(supabase, input.empresaId),
  ])

  const e = empRes.data as { nome?: string; cnpj?: string | null; telefone?: string | null; wl_logo_url?: string | null } | null
  const c = cliRes.data as Partial<ContratoComprador> | null

  const dados: DadosContrato = {
    loja: { nome: e?.nome ?? 'Loja', cnpj: e?.cnpj ?? null, telefone: e?.telefone ?? null, logoUrl: e?.wl_logo_url ?? null },
    comprador: { ...COMPRADOR_VAZIO, ...(c ?? {}) },
    // Congela a garantia item a item: o produto pode mudar de política depois,
    // o contrato assinado não muda.
    itens: input.itens.map((i) => ({ ...i, garantia_dias: i.garantia_dias ?? garantiaLoja })),
    total: input.total,
    desconto: input.desconto,
    forma_pagamento: input.forma_pagamento,
    parcelas: input.parcelas,
    garantia_dias: garantiaLoja,
    vendedor: input.vendedor,
    data: input.data,
  }

  const html = gerarContratoHTML(dados)

  const { error } = await supabase.from('contratos_venda').insert({
    empresa_id: input.empresaId,
    cliente_id: input.clienteId,
    venda_ids: input.vendaIds,
    dados: dados as unknown as Record<string, unknown>,
    html,
    garantia_dias: garantiaLoja,
    criado_por: input.criadoPor ?? null,
  } as never)

  return { html, salvo: !error }
}

/** 2ª via: o contrato arquivado que contém esta linha de venda, se existir. */
export async function buscarContratoDaVenda(supabase: Client, vendaId: number): Promise<string | null> {
  const { data } = await supabase
    .from('contratos_venda')
    .select('html')
    .contains('venda_ids', [vendaId])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { html?: string } | null)?.html ?? null
}
