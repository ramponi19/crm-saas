import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>

/**
 * QUAL TABELA O REALTIME ESCUTA — e como a linha volta ao formato antigo.
 *
 * `postgres_changes` lê o WAL de TABELA. No core v1 `leads` e `lead_mensagens`
 * viram views: assinar a view não dá erro nenhum, só nunca dispara. O sino, o
 * kanban e o chat aberto ficariam mudos sem ninguém perceber.
 *
 * `NEXT_PUBLIC_DB_CORE` escolhe o banco do deploy (embutida no build):
 *   ausente ou "legado" → leads / lead_mensagens (hoje);
 *   "v1"                → negocios / mensagens, mais conversas e contatos, que
 *                         carregam o que no legado chegava como UPDATE em leads
 *                         (não lidas, última mensagem, nome).
 *
 * O payload muda junto: `mensagens` não tem `lead_id` (tem `contato_id`) e
 * `negocios` não tem os campos de `leads`. Quem assina não lê o payload cru —
 * passa pelas funções abaixo, que devolvem o formato antigo nos dois estados.
 * No v1 elas releem a linha pelas views de compatibilidade: o `lead_id` sai
 * pela mesma regra da view, e a RLS decide o que esta sessão enxerga.
 */
export const NUCLEO: 'legado' | 'v1' = process.env.NEXT_PUBLIC_DB_CORE === 'v1' ? 'v1' : 'legado'

export const TABELAS = NUCLEO === 'v1'
  ? { lead: 'negocios', mensagem: 'mensagens', extrasDoLead: ['conversas', 'contatos'] }
  : { lead: 'leads', mensagem: 'lead_mensagens', extrasDoLead: [] as string[] }

type Linha = Record<string, unknown>

/**
 * Leads (formato da tabela/view `leads`) afetados por uma linha que chegou
 * pelo Realtime em `TABELAS.lead` ou em `TABELAS.extrasDoLead`.
 *
 * Vazio = nenhum lead que esta sessão possa ver (RLS) — no v1 também é o que
 * volta para negócio apagado ou fora da loja selecionada.
 */
export async function leadsDaLinha<T = Linha>(db: Client, tabela: string, linha: object): Promise<T[]> {
  if (NUCLEO === 'legado') return [linha as T]
  const l = linha as Linha
  let ids: number[] = []
  if (tabela === 'negocios') ids = [Number(l.id)]
  else {
    const contato = tabela === 'contatos' ? l.id : l.contato_id
    if (contato == null) return []
    const { data } = await db.from('negocios').select('id').eq('contato_id', contato as number)
    ids = (data ?? []).map((n: { id: number }) => n.id)
  }
  if (!ids.length) return []
  const { data } = await db.from('leads').select('*').in('id', ids)
  return (data ?? []) as T[]
}

/**
 * Mensagem no formato de `lead_mensagens` (com `lead_id`). Null = esta sessão
 * não enxerga a mensagem.
 */
export async function mensagemComLead<T = Linha>(db: Client, linha: object): Promise<T | null> {
  if (NUCLEO === 'legado') return linha as T
  const { data } = await db.from('lead_mensagens').select('*').eq('id', (linha as Linha).id as number).maybeSingle()
  return (data ?? null) as T | null
}

/**
 * Filtro do Realtime para as mensagens da conversa de um lead.
 * Legado: `lead_id=eq.X`. v1: a mensagem pertence ao contato, então
 * `contato_id=eq.<contato do negócio>`. Null = negócio não encontrado.
 * As colunas que o chat usa (direcao, conteudo, tipo, midia_url,
 * status_entrega, erro_envio, external_id, lida, created_at) têm o mesmo nome
 * nas duas tabelas.
 */
export async function filtroMensagensDoLead(db: Client, leadId: number): Promise<string | null> {
  if (NUCLEO === 'legado') return `lead_id=eq.${leadId}`
  const { data } = await db.from('negocios').select('contato_id').eq('id', leadId).maybeSingle()
  return data?.contato_id != null ? `contato_id=eq.${data.contato_id}` : null
}
