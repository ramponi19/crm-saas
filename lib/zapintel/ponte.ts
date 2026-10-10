import type { SupabaseClient } from '@supabase/supabase-js'
import { buscarTudo } from '@/lib/zapintel/conversas'

/**
 * A PONTE: QUAL CONVERSA PRECEDEU CADA VENDA.
 *
 * ══ POR QUE ISTO É O PRIMEIRO PASSO DA RECONSTRUÇÃO ════════════════════════
 *
 * Sem ligar venda a conversa, tudo que o ZapIntel afirma é heurística escrita
 * à mão. "Pediu 18x" vale ponto porque pareceu que valia; "cliente" é quem
 * disse certas palavras. Medido em 09/10/2026, dos 130 leads marcados como
 * clientes, **27 tinham prova de pagamento** e o gatilho nº 1 era "imei" (101
 * leads) — que é pergunta de cotação de troca, o oposto de venda fechada.
 *
 * Com a ponte dá para conferir contra o que aconteceu de verdade. É o que as
 * ferramentas do segmento chamam de ligar conversa a resultado, e é de onde
 * elas dizem que vem o retorno.
 *
 * ══ POR QUE TELEFONE, E SÓ TELEFONE ════════════════════════════════════════
 *
 * Testado em 10/10/2026 sobre as 60 vendas da JM: casar por NOME é inviável.
 * O primeiro nome de uma cliente ("Ana Beatriz") casa com 130 leads; "Lucas",
 * com 30. Não é questão de afinar o limiar — não há sinal ali.
 *
 * Telefone casa assim:
 *
 *     32 clientes ... exatamente 1 conversa ....... confiança alta
 *      1 cliente .... 2 conversas ................. desempate por data
 *     17 clientes ... nenhuma conversa ............ fica registrado como tal
 *
 * Os 17 não são falha da ponte: são venda de balcão, ou cliente que falou por
 * outro número. Registrar isso é informação — "venda sem conversa" é um número
 * que a loja vai querer ver.
 *
 * ══ POR QUE OS ÚLTIMOS 8 DÍGITOS ═══════════════════════════════════════════
 *
 * O mesmo telefone aparece em três formatos na base: `19998353017` no cadastro
 * do cliente, `5519998353017` no lead vindo do WhatsApp, `(19) 99538 4616`
 * digitado à mão. DDI, DDD e o nono dígito entram e saem. Os 8 finais são a
 * parte que não muda.
 *
 * ══ A ARMADILHA QUE QUASE ESTRAGOU ISTO ════════════════════════════════════
 *
 * Na primeira medição, 9 clientes pareciam casar com 2 ou 3 leads cada. Não
 * eram pessoas diferentes: eram LEADS DUPLICADOS — 154 deles criados no mesmo
 * dia, 18/09/2026, todos sem nenhuma mensagem. Exigir conversa (`msgs > 0`)
 * dissolve a ambiguidade quase toda, porque a cópia vazia some sozinha.
 *
 * (Essas duplicatas também explicam outra coisa: dos 160 leads "sem conversa"
 * que o painel mostra, 158 são cópias de leads que TÊM conversa. O número
 * existe, mas não significa "gente que nunca foi atendida".)
 */

/** Só os 8 finais. Ver o cabeçalho para o porquê. */
export const chaveTelefone = (t: string | null | undefined): string => {
  const d = (t ?? '').replace(/\D/g, '')
  return d.length >= 8 ? d.slice(-8) : ''
}

export type ComoCasou =
  | 'telefone'
  | 'telefone_multiplo'
  | 'sem_conversa'
  | 'sem_telefone'
  | 'manual'

export interface LinhaPonte {
  venda_id: number
  empresa_id: number
  cliente_id: number | null
  lead_id: number | null
  como: ComoCasou
  confianca: 'alta' | 'media' | 'nenhuma'
  dias_ate_venda: number | null
}

interface VendaBanco {
  id: number
  cliente_id: number | null
  data_venda: string | null
  valor_venda: number | null
  status: string | null
  canal_venda: string | null
}

interface ClienteBanco { id: number; telefone: string | null }

interface LeadComConversa {
  id: number
  telefone: string | null
  origem_id: string | null
  primeira: string
  ultima: string
  mensagens: number
}

const DIA_MS = 86_400_000

/**
 * Lê os leads que TÊM conversa, com a janela de cada uma.
 *
 * Vem do agregado em SQL e não das mensagens: são 55 mil linhas, e tudo que a
 * ponte precisa delas é primeira data, última data e quantas são.
 *
 * Paginado, e **inclusive sendo função**: o PostgREST corta em 1000 linhas em
 * silêncio, também em RPC. São 2.055 leads com conversa na JM — sem paginar,
 * mil deles simplesmente não existiriam para a ponte, e as vendas correspondentes
 * cairiam como "sem conversa" sem ninguém notar. É o mesmo corte mudo que já fez
 * a análise parar em 23/09 e a tela de Leads dizer "1000 de 1843".
 */
function leadsComConversa(db: SupabaseClient, empresaId: number): Promise<LeadComConversa[]> {
  return buscarTudo<LeadComConversa>((de, ate) =>
    db.rpc('zapintel_leads_com_conversa', { p_empresa: empresaId })
      .order('id', { ascending: true })
      .range(de, ate))
}

/**
 * Decide, entre vários candidatos, qual conversa precedeu a venda.
 *
 * A data manda: a conversa que começou ANTES da venda e terminou mais perto
 * dela é a que levou àquela compra. Só quando nenhuma delas cerca a venda é
 * que o tamanho decide — e aí a confiança cai, porque é chute informado.
 */
function escolher(candidatos: LeadComConversa[], dataVenda: number | null): LeadComConversa {
  if (candidatos.length === 1 || dataVenda == null) {
    return [...candidatos].sort((a, b) => b.mensagens - a.mensagens)[0]
  }
  const antes = candidatos.filter((c) => new Date(c.primeira).getTime() <= dataVenda)
  const pool = antes.length ? antes : candidatos
  return [...pool].sort((a, b) => {
    const da = Math.abs(new Date(a.ultima).getTime() - dataVenda)
    const db_ = Math.abs(new Date(b.ultima).getTime() - dataVenda)
    return da === db_ ? b.mensagens - a.mensagens : da - db_
  })[0]
}

/** Monta a ponte da empresa inteira. Não grava — quem grava é `gravarPonte`. */
export async function montarPonte(db: SupabaseClient, empresaId: number): Promise<LinhaPonte[]> {
  const vendas = await buscarTudo<VendaBanco>((de, ate) =>
    db.from('vendas')
      .select('id, cliente_id, data_venda, valor_venda, status, canal_venda')
      .eq('empresa_id', empresaId)
      .order('id', { ascending: true }).range(de, ate))

  if (!vendas.length) return []

  const clientes = await buscarTudo<ClienteBanco>((de, ate) =>
    db.from('clientes').select('id, telefone')
      .eq('empresa_id', empresaId)
      .order('id', { ascending: true }).range(de, ate))

  const telDoCliente = new Map(clientes.map((c) => [c.id, c.telefone]))

  // Índice por chave de telefone. Só leads COM conversa entram: a cópia vazia
  // do duplicado some aqui, e é isso que desfaz a ambiguidade.
  const porChave = new Map<string, LeadComConversa[]>()
  for (const l of await leadsComConversa(db, empresaId)) {
    const k = chaveTelefone(l.telefone ?? l.origem_id)
    if (!k) continue
    const lista = porChave.get(k)
    if (lista) lista.push(l); else porChave.set(k, [l])
  }

  return vendas.map((v): LinhaPonte => {
    const base = { venda_id: v.id, empresa_id: empresaId, cliente_id: v.cliente_id ?? null }
    const chave = chaveTelefone(v.cliente_id != null ? telDoCliente.get(v.cliente_id) : null)

    if (!chave) {
      return { ...base, lead_id: null, como: 'sem_telefone', confianca: 'nenhuma', dias_ate_venda: null }
    }

    const candidatos = porChave.get(chave)
    if (!candidatos?.length) {
      return { ...base, lead_id: null, como: 'sem_conversa', confianca: 'nenhuma', dias_ate_venda: null }
    }

    const quando = v.data_venda ? new Date(v.data_venda).getTime() : null
    const escolhido = escolher(candidatos, quando)
    const dias = quando != null
      ? Math.max(0, Math.round((quando - new Date(escolhido.primeira).getTime()) / DIA_MS))
      : null

    return {
      ...base,
      lead_id: escolhido.id,
      como: candidatos.length > 1 ? 'telefone_multiplo' : 'telefone',
      confianca: candidatos.length > 1 ? 'media' : 'alta',
      dias_ate_venda: dias,
    }
  })
}

/**
 * Grava a ponte.
 *
 * `manual` nunca é sobrescrito: se uma pessoa confirmou qual conversa gerou a
 * venda, nenhum palpite por telefone tem o direito de desfazer isso.
 */
export async function gravarPonte(db: SupabaseClient, linhas: LinhaPonte[]): Promise<number> {
  if (!linhas.length) return 0

  const { data: fixos } = await db
    .from('zapintel_venda_lead').select('venda_id')
    .eq('empresa_id', linhas[0].empresa_id).eq('como', 'manual')
  const protegidos = new Set((fixos ?? []).map((f) => (f as { venda_id: number }).venda_id))

  const gravar = linhas.filter((l) => !protegidos.has(l.venda_id))
  for (let i = 0; i < gravar.length; i += 500) {
    const { error } = await db
      .from('zapintel_venda_lead')
      .upsert(gravar.slice(i, i + 500), { onConflict: 'venda_id' })
    if (error) throw new Error(error.message)
  }
  return gravar.length
}
