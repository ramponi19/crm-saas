import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lead } from '@/components/modules/leads/types'

/**
 * O QUADRO DE LEADS LÊ O CORE (04/11/2026).
 *
 * A tela /leads carregava a lista inteira pela view `leads` (5,1 MB por abertura
 * em Mogi). Agora pede ao banco, com a RLS de quem está logado:
 *
 *   quadro_contagens   total, valor e aguardando resposta por etapa + esteira
 *   quadro_pagina      os 50 mais recentes de cada etapa, os próximos 50 de uma
 *                      etapa ("carregar mais") ou alguns leads pelo id (tempo real)
 *
 * (migração 20261104000200_quadro_core.sql). A entrega vem compacta — nomes das
 * colunas uma vez, cada lead como lista — e vira aqui o mesmo `Lead` de sempre.
 * Telefone, Instagram e primeira mensagem chegam só como "tem": o cartão não os
 * mostra, só o score e a regra de qualificação olham; o card do lead busca o
 * resto quando abre.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>

export const POR_ETAPA = 50
/** Marca de "tem" para os campos que o quadro não traz por inteiro. */
const TEM = '•'

export interface FiltrosDoQuadro {
  /** Nulo = todos (empresa sem funil cadastrado). */
  funilId: number | null
  /** Só os leads deste responsável (filtro de quem gerencia a equipe). */
  responsavelId?: string | null
  /** Só a esteira (sem responsável). */
  esteira?: boolean
  /** Sem "ver leads de outros": os do usuário e a esteira. */
  soMeus?: string | null
}

export interface ContagemDaEtapa { total: number; valor: number; aguardando: number }
export interface Contagens { etapas: Record<string, ContagemDaEtapa>; esteira: number }

interface Pagina { colunas: string[]; linhas: unknown[][] }

/**
 * O instante que ordena o quadro e serve de cursor: a última mensagem DO CLIENTE, ou a
 * criação (06/11/2026). Resposta da equipe não mexe na posição — a mesma regra de
 * quadro_base.momento (migração 20261106000100_quadro_ordem_cliente).
 */
export function momentoDe(l: Pick<Lead, 'ultima_recebida_at' | 'created_at'>): string {
  return l.ultima_recebida_at ?? l.created_at ?? new Date(0).toISOString()
}

/** Mais recente primeiro, id como desempate — a mesma ordem do banco. */
export function ordenarQuadro(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const d = new Date(momentoDe(b)).getTime() - new Date(momentoDe(a)).getTime()
    return d !== 0 ? d : b.id - a.id
  })
}

/** A entrega compacta como `Lead` (+ contato_id, para o tempo real achar o lead pela conversa). */
export function decodificar(p: Pagina | null): (Lead & { contato_id: number })[] {
  if (!p) return []
  const idx = Object.fromEntries(p.colunas.map((c, i) => [c, i]))
  const v = (l: unknown[], c: string) => l[idx[c]] as never
  return p.linhas.map((l) => ({
    id: v(l, 'id'),
    contato_id: v(l, 'contato_id'),
    nome: v(l, 'nome'),
    telefone: v(l, 'tem_telefone') ? TEM : null,
    instagram: v(l, 'tem_instagram') ? TEM : null,
    origem: v(l, 'origem'),
    kanban_status: v(l, 'kanban_status'),
    responsavel_id: v(l, 'responsavel_id'),
    observacoes: null,
    created_at: v(l, 'created_at'),
    ativo: true,
    primeira_msg: v(l, 'tem_primeira_msg') ? TEM : null,
    msgs_nao_lidas: v(l, 'msgs_nao_lidas'),
    ultima_tratativa: v(l, 'ultima_tratativa'),
    ultima_mensagem_at: v(l, 'ultima_mensagem_at'),
    ultima_recebida_at: v(l, 'ultima_recebida_at'),
    ultima_enviada_at: v(l, 'ultima_enviada_at'),
    produto_interessado: v(l, 'produto_interessado'),
    valor_estimado: v(l, 'valor_estimado') == null ? null : Number(v(l, 'valor_estimado')),
    convertido_em: null,
  }))
}

const params = (f: FiltrosDoQuadro) => ({
  p_funil: f.funilId,
  p_responsavel: f.responsavelId || null,
  p_esteira: !!f.esteira,
  p_so_meus: f.soMeus || null,
})

export async function contagensDoQuadro(db: Db, f: FiltrosDoQuadro): Promise<Contagens> {
  const { data, error } = await db.rpc('quadro_contagens', params(f))
  if (error) throw new Error(error.message)
  const c = (data ?? {}) as Partial<Contagens>
  return { etapas: c.etapas ?? {}, esteira: c.esteira ?? 0 }
}

/** A abertura: os 50 mais recentes de cada etapa. */
export async function aberturaDoQuadro(db: Db, f: FiltrosDoQuadro) {
  const { data, error } = await db.rpc('quadro_pagina', { ...params(f), p_por_etapa: POR_ETAPA })
  if (error) throw new Error(error.message)
  return decodificar(data as Pagina)
}

/** "Carregar mais": os próximos 50 de uma etapa, depois do último cartão já na tela. */
export async function maisDaEtapa(db: Db, f: FiltrosDoQuadro, etapa: string, ultimo: Lead) {
  const { data, error } = await db.rpc('quadro_pagina', {
    ...params(f), p_por_etapa: POR_ETAPA, p_etapa: etapa,
    p_antes_momento: momentoDe(ultimo), p_antes_id: ultimo.id,
  })
  if (error) throw new Error(error.message)
  return decodificar(data as Pagina)
}

/**
 * Tempo real: os leads pelo id, como o quadro os mostraria AGORA. Quem não volta
 * saiu do quadro (arquivado, outro funil, não passa no filtro, outra loja).
 */
export async function leadsPorId(db: Db, f: FiltrosDoQuadro, ids: number[]) {
  if (!ids.length) return []
  const { data, error } = await db.rpc('quadro_pagina', { ...params(f), p_ids: ids })
  if (error) throw new Error(error.message)
  return decodificar(data as Pagina)
}
