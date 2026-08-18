// Emissão e recuperação do contrato de venda.
//
// O contrato é EMITIDO UMA VEZ, no fechamento da venda, e arquivado em
// `contratos_venda`. O Histórico não regera nada: busca o documento e imprime.
// Isso resolve dois problemas que a remontagem tinha: a 2ª via saía com o
// cadastro de hoje (não o do dia da assinatura) e, como o PDV grava uma linha
// por item em `vendas`, uma venda de 3 produtos virava 3 contratos de 1 item.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContratoItem, ContratoComprador, ContratoLoja } from './contrato-tipos'
import { renderizarModelo, type ModeloContrato, type PaginaModelo, type DadosMescla } from './contrato-modelo'
import { camposFaltantesContrato } from './cliente-contrato'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>

/** Usado quando a loja não configurou nada em /admin/configuracoes. */
export const GARANTIA_PADRAO_DIAS = 90

const CAMPOS_COMPRADOR =
  'nome, cpf_cnpj, nacionalidade, estado_civil, profissao, data_nascimento, telefone, email, endereco, numero, complemento, bairro, cidade, estado, cep'

const COMPRADOR_VAZIO: ContratoComprador = {
  nome: '', cpf_cnpj: null, nacionalidade: null, estado_civil: null, profissao: null,
  data_nascimento: null, telefone: null, email: null, endereco: null, numero: null, complemento: null,
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

/** Documentos da loja que estao prontos para emitir (tem versao ativa). */
export interface DocumentoDisponivel { id: number; nome: string }

export async function documentosDisponiveis(supabase: Client, empresaId: number): Promise<DocumentoDisponivel[]> {
  const { data } = await supabase
    .from('contrato_documentos')
    .select('id, nome, contrato_modelos!inner(id)')
    .eq('empresa_id', empresaId).eq('arquivado', false)
    .eq('contrato_modelos.ativo', true)
    .order('nome')
  return ((data ?? []) as { id: number; nome: string }[]).map((d) => ({ id: d.id, nome: d.nome }))
}

/** Versao ativa de UM documento. */
export async function modeloAtivo(supabase: Client, documentoId: number): Promise<ModeloContrato | null> {
  const { data } = await supabase
    .from('contrato_modelos')
    .select('id, versao, paginas')
    .eq('documento_id', documentoId).eq('ativo', true)
    .maybeSingle()
  if (!data) return null
  const paginas = (data.paginas ?? []) as PaginaModelo[]
  if (!Array.isArray(paginas) || paginas.length === 0) return null
  return { id: data.id as number, versao: data.versao as number, paginas }
}

export interface EmitirContratoInput {
  empresaId: number
  /** Qual documento da biblioteca emitir. O vendedor escolhe. */
  documentoId: number
  nomeDocumento: string
  clienteId: number | null
  /** Todas as linhas de `vendas` desta venda — é o que amarra o contrato a ela. */
  vendaIds: number[]
  itens: ContratoItem[]
  /** Aparelhos recebidos em troca — alimentam os marcadores {{trocas}}. */
  trocas?: { aparelho: string; imei?: string | null; valor: number }[]
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
  /** null quando a empresa não tem modelo — não existe contrato a emitir. */
  html: string | null
  /** false = o documento foi montado mas não chegou ao banco (não haverá 2ª via). */
  salvo: boolean
  /** O documento escolhido nao tem versao salva (nada a emitir). */
  semModelo: boolean
  /**
   * Campos do comprador que saíram EM BRANCO no documento (rótulos prontos para
   * mostrar). Vazio = cadastro completo.
   */
  faltando?: string[]
  /**
   * Campos da LOJA que o modelo pede e o cadastro não tem. Só entra o que o
   * modelo realmente usa: cobrar dado que não vai a lugar nenhum é ruído.
   */
  faltandoLoja?: string[]
}

/**
 * O que a loja precisa preencher para ESTE modelo sair completo.
 *
 * Cada linha liga um marcador ao campo do cadastro. A verificação olha o modelo
 * antes de reclamar: se o lojista não escreveu {{loja.cep}} no contrato dele, o CEP
 * em branco não é problema nenhum.
 */
const CAMPOS_LOJA: { marcador: string; label: string; ler: (l: ContratoLoja) => string | null | undefined }[] = [
  { marcador: 'loja.nome',              label: 'Nome / razão social',    ler: (l) => l.nome },
  { marcador: 'loja.cnpj',              label: 'CNPJ',                   ler: (l) => l.cnpj },
  { marcador: 'loja.telefone',          label: 'Telefone',               ler: (l) => l.telefone },
  { marcador: 'loja.email',             label: 'E-mail',                 ler: (l) => l.email },
  { marcador: 'loja.cep',               label: 'CEP',                    ler: (l) => l.cep },
  { marcador: 'loja.endereco',          label: 'Endereço',               ler: (l) => l.endereco },
  { marcador: 'loja.numero',            label: 'Número',                 ler: (l) => l.numero },
  { marcador: 'loja.bairro',            label: 'Bairro',                 ler: (l) => l.bairro },
  { marcador: 'loja.cidade',            label: 'Cidade',                 ler: (l) => l.cidade },
  { marcador: 'loja.estado',            label: 'Estado (UF)',            ler: (l) => l.estado },
  { marcador: 'loja.cidade_estado',     label: 'Cidade e estado',        ler: (l) => [l.cidade, l.estado].filter(Boolean).join('') },
  { marcador: 'loja.representante',     label: 'Quem assina pela loja',  ler: (l) => l.representanteNome },
  { marcador: 'loja.representante_cpf', label: 'CPF de quem assina',     ler: (l) => l.representanteCpf },
]

function camposFaltantesLoja(loja: ContratoLoja, modelo: ModeloContrato): string[] {
  // O modelo é JSON com HTML dentro; procurar no texto todo cobre qualquer bloco.
  // Minúsculas dos dois lados porque `mesclar` também ignora caixa.
  const texto = JSON.stringify(modelo.paginas).toLowerCase()
  return CAMPOS_LOJA
    .filter(({ marcador, ler }) => texto.includes(`{{${marcador}}}`) && !String(ler(loja) ?? '').trim())
    .map(({ label }) => label)
}

/**
 * Monta o contrato com os dados do momento e arquiva.
 *
 * SEM MODELO DA EMPRESA, NÃO EMITE. O produto não traz contrato pronto de
 * propósito: as cláusulas (garantia, foro, rescisão) são do lojista, e um texto
 * nosso passaria a responsabilidade por um contrato errado para nós.
 *
 * Nunca lança: a venda já aconteceu quando isto roda, e falhar aqui não pode
 * derrubar o fechamento. Se a gravação falhar, devolve o HTML mesmo assim para
 * o operador conseguir imprimir na hora — com `salvo: false` para quem chamou
 * poder avisar que a 2ª via não vai existir.
 */
export async function emitirContrato(supabase: Client, input: EmitirContratoInput): Promise<ContratoEmitido> {
  const [empRes, cliRes, garantiaLoja, modelo] = await Promise.all([
    supabase.from('empresas')
      .select('nome, cnpj, telefone, wl_logo_url, email, cep, endereco, numero, complemento, bairro, cidade, estado, representante_nome, representante_cpf')
      .eq('id', input.empresaId).maybeSingle(),
    input.clienteId
      ? supabase.from('clientes').select(CAMPOS_COMPRADOR).eq('id', input.clienteId).maybeSingle()
      : Promise.resolve({ data: null }),
    garantiaPadraoLoja(supabase, input.empresaId),
    modeloAtivo(supabase, input.documentoId),
  ])

  // Sem modelo não há contrato. Sai antes de montar dado nenhum.
  if (!modelo) return { html: null, salvo: false, semModelo: true }

  const e = empRes.data as {
    nome?: string; cnpj?: string | null; telefone?: string | null; wl_logo_url?: string | null
    email?: string | null; cep?: string | null; endereco?: string | null; numero?: string | null
    complemento?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null
    representante_nome?: string | null; representante_cpf?: string | null
  } | null
  const c = cliRes.data as Partial<ContratoComprador> | null

  const dados: DadosMescla = {
    loja: {
      nome: e?.nome ?? 'Loja', cnpj: e?.cnpj ?? null, telefone: e?.telefone ?? null,
      logoUrl: e?.wl_logo_url ?? null,
      email: e?.email ?? null, cep: e?.cep ?? null,
      endereco: e?.endereco ?? null, numero: e?.numero ?? null, complemento: e?.complemento ?? null,
      bairro: e?.bairro ?? null, cidade: e?.cidade ?? null, estado: e?.estado ?? null,
      representanteNome: e?.representante_nome ?? null, representanteCpf: e?.representante_cpf ?? null,
    },
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
    trocas: input.trocas,
  }

  const html = renderizarModelo(modelo, dados)

  const { error } = await supabase.from('contratos_venda').insert({
    empresa_id: input.empresaId,
    cliente_id: input.clienteId,
    venda_ids: input.vendaIds,
    dados: dados as unknown as Record<string, unknown>,
    html,
    garantia_dias: garantiaLoja,
    documento_id: input.documentoId,
    // Nome congelado: renomear o documento depois nao muda o que foi assinado.
    nome_documento: input.nomeDocumento,
    criado_por: input.criadoPor ?? null,
  } as never)

  return {
    html, salvo: !error, semModelo: false,
    // O que o cadastro do comprador não tinha. O contrato imprime o espaço em
    // branco sem reclamar, então quem emite precisa saber ANTES de entregar o
    // papel — cliente antigo, cadastrado quando nada era obrigatório, continua
    // incompleto e ninguém perceberia até alguém ler o contrato assinado.
    faltando: camposFaltantesContrato(dados.comprador),
    /**
     * O que falta na LOJA.
     *
     * Simétrico ao comprador, e pela mesma razão: contrato de compra e venda sem
     * identificar a VENDEDORA não identifica as partes. Só entra na lista o que o
     * modelo realmente usa — avisar sobre marcador que o lojista não escreveu seria
     * cobrar dado que não vai a lugar nenhum.
     */
    faltandoLoja: camposFaltantesLoja(dados.loja, modelo),
  }
}

export interface ContratoArquivado { id: number; nome: string | null; html: string; created_at: string }

/** Todos os documentos JA emitidos para esta venda — a 2a via de cada um. */
export async function contratosDaVenda(supabase: Client, vendaId: number): Promise<ContratoArquivado[]> {
  const { data } = await supabase
    .from('contratos_venda')
    .select('id, nome_documento, html, created_at')
    .contains('venda_ids', [vendaId])
    .order('created_at', { ascending: true })
  return ((data ?? []) as { id: number; nome_documento: string | null; html: string; created_at: string }[])
    .map((c) => ({ id: c.id, nome: c.nome_documento, html: c.html, created_at: c.created_at }))
}
