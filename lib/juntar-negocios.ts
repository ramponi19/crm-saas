import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * JUNTAR NEGÓCIOS DO MESMO CONTATO, LOJA E FUNIL (06/11/2026).
 *
 * A fusão de contatos (lib/fusao-contatos.ts) passava os negócios do contato que sai
 * para o que fica, mas não os juntava: o Osvaldo Junior (Instagram + WhatsApp) ficou
 * com dois negócios abertos em Mogi, dois cartões no quadro e dois resultados na busca.
 * A regra do produto é UM card por contato por loja (05/11).
 *
 * Por contato, loja e funil, entre os negócios ATIVOS, fica (regra do Lucas, 06/11/2026):
 *   aberto x fechado   o aberto (ganho e perdido são "fechados")
 *   dois abertos       o mais avançado no funil (maior `ordem` da etapa); empate, o mais recente
 *   dois fechados      o fechado mais recentemente (ganho_em/perdido_em; sem data, a criação)
 * O que sai vira ativo = false (`dados._lead.ativo`, de onde a coluna `ativo` é gerada),
 * com `dados._juntado` dizendo para qual foi. Se ele estava FECHADO, o fechamento vai
 * para `negocio_historico` do que fica (acao 'fechamento_juntado', com status, datas,
 * motivo e valor — como a reabertura do cliente que volta) e o status dele é limpo:
 * o ganho/perda continua nos relatórios por lib/fechamentos.ts, uma vez só.
 * e tudo que apontava para o que sai passa para o que fica (TABELAS_DO_NEGOCIO), menos:
 *   cadência     inscrição ATIVA numa cadência em que o que fica já está ativo sai dela
 *                (status 'saiu'); as outras mudam de negócio
 *   automação    execução AGENDADA do que sai é pulada (senão rodaria duas vezes);
 *                todas mudam de negócio (o histórico vai junto)
 *   perfil de busca (imóveis, um por negócio) só passa se o que fica não tiver
 *   ficha da IA  (zapintel_lead_perfil, uma por negócio) fica no negócio que sai
 * As mensagens não mudam: são da conversa do contato NA LOJA, e o que fica passa a
 * ser o negócio principal (o único ativo).
 *
 * Primeiro LÊ tudo; depois escreve, registrando cada passo na foto ANTES de fazê-lo.
 * Se um passo falha, a própria foto desfaz o que já foi feito. Cada junção gravada
 * vira um evento `negocio.juntado` com a foto; `desfazerJuncao` volta por ela.
 * Pelo cliente de serviço (quem chama já conferiu dono/admin).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>
type Linha = Record<string, unknown>

/** Colunas que apontam para `negocios` e mudam de negócio sem regra especial. */
export const TABELAS_DO_NEGOCIO: { tabela: string; coluna: string; pk?: string }[] = [
  { tabela: 'assistencia_orcamentos', coluna: 'lead_id' },
  { tabela: 'avaliacao_cotacoes', coluna: 'lead_id' },
  { tabela: 'avaliacao_usados', coluna: 'lead_id' },
  { tabela: 'chamadas', coluna: 'lead_id' },
  { tabela: 'estoque_unidades', coluna: 'reservado_lead_id' },
  { tabela: 'imoveis_negocios', coluna: 'lead_id' },
  { tabela: 'integracao_eventos', coluna: 'lead_id' },
  { tabela: 'negocio_historico', coluna: 'negocio_id' },
  { tabela: 'rastreamento_eventos', coluna: 'lead_id' },
  { tabela: 'rastreamento_visitas', coluna: 'lead_id' },
  { tabela: 'tarefas', coluna: 'lead_id' },
  { tabela: 'tarefas', coluna: 'negocio_id' },
  { tabela: 'vendas_fichas_financiamento', coluna: 'lead_id' },
  { tabela: 'vendas_propostas', coluna: 'lead_id' },
  { tabela: 'visitas', coluna: 'lead_id' },
  { tabela: 'zapintel_venda_lead', coluna: 'lead_id', pk: 'venda_id' },
]
/** Tratadas à parte (ver o cabeçalho) — listadas para a conferência de que nada ficou de fora. */
export const TABELAS_COM_REGRA = ['cadencia_inscricoes.lead_id', 'cadencia_inscricoes.negocio_id', 'automacao_execucoes.negocio_id', 'imoveis_perfis_busca.lead_id', 'zapintel_lead_perfil.lead_id']

export interface FotoDaJuncao {
  versao: 1
  fica: number
  sai: number
  contato: number
  origem: 'fusao' | 'correcao'
  fusao: number | null
  /** `dados` do negócio que saiu, como estava. */
  dadosAntes: Linha
  /** tabela.coluna → chaves das linhas que passaram do que sai para o que fica. */
  linhas: Record<string, number[]>
  /** inscrições ativas que saíram da cadência (com a próxima ação de antes). */
  cadenciaSaiu: { id: number; proxima_acao_em: string | null }[]
  /** execuções agendadas puladas (com o motivo de antes). */
  automacaoPulada: { id: number; motivo: string | null }[]
  /** ids em negocio_historico gravados pela junção. */
  historico: number[]
  /** O fechamento do que saiu (ganho/perdido), guardado no histórico do que fica; o desfazer o devolve. */
  fechamento?: { historico: number | null; status: string; ganho_em: string | null; perdido_em: string | null; motivo_perda_id: number | null }
}

export interface Juncao { evento: number; fica: number; sai: number; filial: number | null; funil: number | null }

type Negocio = { id: number; filial_id: number | null; funil_id: number | null; etapa_id: number | null; created_at: string; dados: Linha | null
  status: string | null; ganho_em: string | null; perdido_em: string | null; motivo_perda_id: number | null; valor_estimado: number | null }

const FECHADOS = ['ganho', 'perdido']
export const estaFechado = (status: string | null | undefined) => FECHADOS.includes(status ?? '')

const chave = (n: { filial_id: number | null; funil_id: number | null }) => `${n.filial_id ?? -1}:${n.funil_id ?? -1}`
/** A chave de cada tabela (quase todas `id`; zapintel_venda_lead é por venda). */
const pkDe = (tabela: string) => TABELAS_DO_NEGOCIO.find((t) => t.tabela === tabela)?.pk ?? 'id'

async function idsOnde(svc: Db, tabela: string, coluna: string, valor: number): Promise<number[]> {
  const pk = pkDe(tabela)
  const out: number[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await svc.from(tabela).select(pk).eq(coluna, valor).order(pk).range(de, de + 999)
    if (error) throw new Error(`${tabela}.${coluna}: ${error.message}`)
    const lote = (data ?? []) as unknown as Record<string, number>[]
    out.push(...lote.map((r) => r[pk]))
    if (lote.length < 1000) return out
  }
}

async function mover(svc: Db, tabela: string, coluna: string, ids: number[], de: number, para: number) {
  const pk = pkDe(tabela)
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await svc.from(tabela).update({ [coluna]: para }).in(pk, ids.slice(i, i + 500)).eq(coluna, de)
    if (error) throw new Error(`${tabela}.${coluna}: ${error.message}`)
  }
}

/**
 * Volta o que a foto registra: ligações (só as que seguem no que ficou), cadência,
 * automação e o `dados` do que saiu. Serve ao desfazer e à volta automática de uma
 * junção que falhou no meio.
 */
async function voltar(svc: Db, f: FotoDaJuncao) {
  for (const [k, ids] of Object.entries(f.linhas)) {
    const [tabela, coluna] = k.split('.')
    await mover(svc, tabela, coluna, ids, f.fica, f.sai)
  }
  for (const c of f.cadenciaSaiu) {
    const { error } = await svc.from('cadencia_inscricoes').update({ status: 'ativa', proxima_acao_em: c.proxima_acao_em }).eq('id', c.id).eq('status', 'saiu')
    if (error) throw new Error(`cadência ${c.id}: ${error.message}`)
  }
  for (const a of f.automacaoPulada) {
    const { error } = await svc.from('automacao_execucoes').update({ status: 'agendada', motivo: a.motivo }).eq('id', a.id).eq('status', 'pulada')
    if (error) throw new Error(`automação ${a.id}: ${error.message}`)
  }
  const fech = f.fechamento
  const patch = fech
    ? { dados: f.dadosAntes, status: fech.status, ganho_em: fech.ganho_em, perdido_em: fech.perdido_em, motivo_perda_id: fech.motivo_perda_id }
    : { dados: f.dadosAntes }
  const { data: volta, error: eV } = await svc.from('negocios').update(patch).eq('id', f.sai).select('id')
  if (eV || !volta?.length) throw new Error(`negócio #${f.sai}: ${eV?.message ?? 'não existe mais'}`)
  // O fechamento volta a ser do negócio: o registro no histórico do outro sai (senão contaria duas vezes).
  if (fech?.historico) {
    const { error } = await svc.from('negocio_historico').delete().eq('id', fech.historico)
    if (error) throw new Error(`fechamento no histórico: ${error.message}`)
  }
}

/**
 * Quais negócios do contato se juntam: por loja e funil, o que fica primeiro.
 * Puro (sem banco) — a mesma escolha da fusão, da correção e da lista de conferência.
 */
export function planoDeJuncao<T extends { id: number; filial_id: number | null; funil_id: number | null; created_at: string; ordem: number | null
  status?: string | null; ganho_em?: string | null; perdido_em?: string | null }>(
  negocios: T[],
): { fica: T; saem: T[] }[] {
  const grupos = new Map<string, T[]>()
  for (const n of negocios) grupos.set(chave(n), [...(grupos.get(chave(n)) ?? []), n])
  const out: { fica: T; saem: T[] }[] = []
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue
    const fechadoEm = (n: T) => n.ganho_em ?? n.perdido_em ?? n.created_at
    const ord = [...lista].sort((a, b) => {
      const fa = estaFechado(a.status), fb = estaFechado(b.status)
      if (fa !== fb) return fa ? 1 : -1                                  // aberto antes de fechado
      if (!fa) return (b.ordem ?? -1) - (a.ordem ?? -1)                  // abertos: o mais avançado,
        || b.created_at.localeCompare(a.created_at) || b.id - a.id      //   empate: o mais recente
      return fechadoEm(b).localeCompare(fechadoEm(a)) || b.id - a.id    // fechados: o mais recente
    })
    out.push({ fica: ord[0], saem: ord.slice(1) })
  }
  return out
}

/** Junta os negócios ativos repetidos do contato (mesma loja e funil). Devolve as junções feitas. */
export async function juntarNegociosDoContato(svc: Db, empresaId: number, contatoId: number,
  quem: { userId: string | null; origem: 'fusao' | 'correcao'; fusao?: number | null }): Promise<{ error: string | null; juncoes: Juncao[] }> {
  const juncoes: Juncao[] = []
  try {
    const { data, error } = await svc.from('negocios').select('id, filial_id, funil_id, etapa_id, created_at, dados, status, ganho_em, perdido_em, motivo_perda_id, valor_estimado')
      .eq('empresa_id', empresaId).eq('contato_id', contatoId).eq('ativo', true)
    if (error) throw new Error(`negócios do contato: ${error.message}`)
    const negocios = (data ?? []) as Negocio[]
    if (new Set(negocios.map(chave)).size === negocios.length) return { error: null, juncoes }

    const etapas = [...new Set(negocios.map((n) => n.etapa_id).filter((e): e is number => e != null))]
    const { data: ets } = etapas.length ? await svc.from('funil_etapas').select('id, ordem').in('id', etapas) : { data: [] }
    const ordem = new Map(((ets ?? []) as { id: number; ordem: number | null }[]).map((e) => [e.id, e.ordem]))
    const plano = planoDeJuncao(negocios.map((n) => ({ ...n, ordem: n.etapa_id != null ? (ordem.get(n.etapa_id) ?? null) : null })))

    for (const { fica, saem } of plano) {
      for (const sai of saem) juncoes.push(await juntarUm(svc, empresaId, contatoId, fica, sai, quem))
    }
    return { error: null, juncoes }
  } catch (e) {
    return { error: (e as Error).message, juncoes }
  }
}

async function juntarUm(svc: Db, empresaId: number, contatoId: number, fica: Negocio, sai: Negocio,
  quem: { userId: string | null; origem: 'fusao' | 'correcao'; fusao?: number | null }): Promise<Juncao> {
  const em = new Date().toISOString()
  const foto: FotoDaJuncao = {
    versao: 1, fica: fica.id, sai: sai.id, contato: contatoId, origem: quem.origem, fusao: quem.fusao ?? null,
    dadosAntes: (sai.dados ?? {}) as Linha, linhas: {}, cadenciaSaiu: [], automacaoPulada: [], historico: [],
  }

  // LEITURA: tudo antes de mexer em qualquer coisa — um erro aqui não deixa meio-termo.
  const simples: { tabela: string; coluna: string; ids: number[] }[] = []
  for (const { tabela, coluna } of TABELAS_DO_NEGOCIO) {
    const ids = await idsOnde(svc, tabela, coluna, sai.id)
    if (ids.length) simples.push({ tabela, coluna, ids })
  }
  const { data: insc, error: eI } = await svc.from('cadencia_inscricoes').select('id, cadencia_id, status, proxima_acao_em, lead_id, negocio_id')
    .or(`lead_id.eq.${sai.id},negocio_id.eq.${sai.id},lead_id.eq.${fica.id},negocio_id.eq.${fica.id}`)
  if (eI) throw new Error(`cadencia_inscricoes: ${eI.message}`)
  type Insc = { id: number; cadencia_id: number; status: string; proxima_acao_em: string | null; lead_id: number | null; negocio_id: number | null }
  const todas = (insc ?? []) as Insc[]
  const doFica = new Set(todas.filter((i) => (i.lead_id === fica.id || i.negocio_id === fica.id) && i.status === 'ativa').map((i) => i.cadencia_id))
  const doSai = todas.filter((i) => i.lead_id === sai.id || i.negocio_id === sai.id)
  const repetidas = doSai.filter((i) => i.status === 'ativa' && doFica.has(i.cadencia_id))
  const { data: exs, error: eA } = await svc.from('automacao_execucoes').select('id, status, motivo').eq('negocio_id', sai.id)
  if (eA) throw new Error(`automacao_execucoes: ${eA.message}`)
  const execucoes = (exs ?? []) as { id: number; status: string; motivo: string | null }[]
  const agendadas = execucoes.filter((x) => x.status === 'agendada')
  const perfilSai = await idsOnde(svc, 'imoveis_perfis_busca', 'lead_id', sai.id)
  const perfilPassa = perfilSai.length > 0 && !(await idsOnde(svc, 'imoveis_perfis_busca', 'lead_id', fica.id)).length

  // ESCRITA: cada passo entra na foto ANTES de ser feito; se algum falhar, a foto volta tudo.
  try {
    // 1. As ligações simples.
    for (const { tabela, coluna, ids } of simples) {
      foto.linhas[`${tabela}.${coluna}`] = ids
      await mover(svc, tabela, coluna, ids, sai.id, fica.id)
    }
    // 2. Cadência: a ativa repetida sai; o resto muda de negócio.
    if (repetidas.length) {
      foto.cadenciaSaiu = repetidas.map((i) => ({ id: i.id, proxima_acao_em: i.proxima_acao_em }))
      const { data: gr, error } = await svc.from('cadencia_inscricoes').update({ status: 'saiu', proxima_acao_em: null })
        .in('id', repetidas.map((i) => i.id)).select('id')
      if (error || (gr ?? []).length !== repetidas.length) throw new Error(`cadência repetida: ${error?.message ?? 'nem todas saíram'}`)
    }
    for (const coluna of ['lead_id', 'negocio_id'] as const) {
      const ids = doSai.filter((i) => i[coluna] === sai.id).map((i) => i.id)
      if (!ids.length) continue
      foto.linhas[`cadencia_inscricoes.${coluna}`] = ids
      await mover(svc, 'cadencia_inscricoes', coluna, ids, sai.id, fica.id)
    }
    // 3. Automação: a agendada é pulada (não roda duas vezes); todas mudam de negócio.
    if (agendadas.length) {
      foto.automacaoPulada = agendadas.map((x) => ({ id: x.id, motivo: x.motivo }))
      const { error } = await svc.from('automacao_execucoes').update({ status: 'pulada', motivo: `negócio juntado em #${fica.id}` })
        .in('id', agendadas.map((x) => x.id)).eq('status', 'agendada')
      if (error) throw new Error(`automação agendada: ${error.message}`)
    }
    if (execucoes.length) {
      foto.linhas['automacao_execucoes.negocio_id'] = execucoes.map((x) => x.id)
      await mover(svc, 'automacao_execucoes', 'negocio_id', execucoes.map((x) => x.id), sai.id, fica.id)
    }
    // 4. Perfil de busca (um por negócio): passa só se o que fica não tem.
    if (perfilPassa) {
      foto.linhas['imoveis_perfis_busca.lead_id'] = perfilSai
      await mover(svc, 'imoveis_perfis_busca', 'lead_id', perfilSai, sai.id, fica.id)
    }
    // 5. Fechado que sai: o fechamento vai para o histórico do que fica (os relatórios o contam lá).
    if (estaFechado(sai.status)) {
      foto.fechamento = { historico: null, status: sai.status!, ganho_em: sai.ganho_em, perdido_em: sai.perdido_em, motivo_perda_id: sai.motivo_perda_id }
      const detalhe = Object.fromEntries(Object.entries({
        status: sai.status, ganho_em: sai.ganho_em, perdido_em: sai.perdido_em, motivo_perda_id: sai.motivo_perda_id,
        valor_estimado: sai.valor_estimado, de_negocio: sai.id, origem: quem.origem, fusao: quem.fusao ?? null,
      }).filter(([, v]) => v != null))
      const { data: hf, error } = await svc.from('negocio_historico').insert({
        empresa_id: empresaId, negocio_id: fica.id, de_etapa_id: sai.etapa_id, para_etapa_id: fica.etapa_id,
        acao: 'fechamento_juntado', por_usuario: quem.userId, detalhe,
      }).select('id').single()
      if (error || !hf) throw new Error(`fechamento no histórico: ${error?.message ?? 'não gravou'}`)
      foto.fechamento.historico = hf.id as number
    }
    // 6. O que sai deixa o funil (e, se estava fechado, perde o status — que agora mora no histórico).
    const lead = ((sai.dados ?? {}) as Linha)._lead as Linha | undefined
    const dados = { ...(sai.dados ?? {}), _lead: { ...(lead ?? {}), ativo: false }, _juntado: { em, para: fica.id, origem: quem.origem, fusao: quem.fusao ?? null } }
    const patch = foto.fechamento ? { dados, status: 'aberto', ganho_em: null, perdido_em: null, motivo_perda_id: null } : { dados }
    const { data: saiu, error: eS } = await svc.from('negocios').update(patch).eq('id', sai.id).select('id, ativo')
    if (eS || !saiu?.length || (saiu[0] as { ativo: boolean }).ativo !== false) throw new Error(`negócio #${sai.id} não saiu do funil: ${eS?.message ?? 'nenhuma linha'}`)
  } catch (e) {
    let volta = 'voltou ao que era'
    try { await voltar(svc, foto) } catch (e2) {
      volta = `e a volta automática também falhou (${(e2 as Error).message}) — foto no log`
      console.error('[juntar-negocios] foto', JSON.stringify(foto))
    }
    throw new Error(`#${sai.id} → #${fica.id}: ${(e as Error).message}; ${volta}`)
  }

  // 7. Histórico dos dois e o evento com a foto.
  const { data: hist, error: eH } = await svc.from('negocio_historico').insert([
    { empresa_id: empresaId, negocio_id: fica.id, acao: 'juntado', por_usuario: quem.userId, detalhe: { recebeu: sai.id, origem: quem.origem, fusao: quem.fusao ?? null } },
    { empresa_id: empresaId, negocio_id: sai.id, acao: 'juntado_em', por_usuario: quem.userId, detalhe: { para: fica.id, origem: quem.origem, fusao: quem.fusao ?? null } },
  ]).select('id')
  if (eH) console.error('[juntar-negocios] histórico não gravado', eH.message)
  foto.historico = ((hist ?? []) as { id: number }[]).map((h) => h.id)
  const { data: ev, error: eE } = await svc.from('eventos').insert({
    empresa_id: empresaId, filial_id: fica.filial_id, tipo: 'negocio.juntado', entidade: 'negocio', entidade_id: fica.id,
    dados: foto, por_usuario: quem.userId,
  }).select('id').single()
  if (eE || !ev) {
    // Sem o evento não há como desfazer depois: volta agora.
    await voltar(svc, foto)
    throw new Error(`#${sai.id} → #${fica.id}: evento da junção não gravou (${eE?.message ?? 'sem id'}); voltou ao que era`)
  }
  return { evento: ev.id as number, fica: fica.id, sai: sai.id, filial: fica.filial_id, funil: fica.funil_id }
}

/**
 * Desfaz uma junção pelo evento `negocio.juntado`: as ligações voltam para o negócio
 * que saiu (só as que seguem no que ficou), cadência e automação voltam ao que eram,
 * e o negócio volta ao funil com o `dados` de antes.
 */
export async function desfazerJuncao(svc: Db, empresaId: number, eventoId: number, userId: string | null): Promise<{ error: string | null }> {
  const { data: ev } = await svc.from('eventos').select('id, empresa_id, tipo, dados').eq('id', eventoId).maybeSingle()
  if (!ev || ev.empresa_id !== empresaId || ev.tipo !== 'negocio.juntado') return { error: 'Junção não encontrada' }
  const { count: ja } = await svc.from('eventos').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('tipo', 'negocio.juncao_desfeita').eq('entidade_id', eventoId)
  if (ja) return { error: 'Esta junção já foi desfeita' }
  const f = ev.dados as FotoDaJuncao
  try {
    await voltar(svc, f)
    await svc.from('negocio_historico').insert([
      { empresa_id: empresaId, negocio_id: f.fica, acao: 'juncao_desfeita', por_usuario: userId, detalhe: { devolveu: f.sai, evento: eventoId } },
      { empresa_id: empresaId, negocio_id: f.sai, acao: 'juncao_desfeita', por_usuario: userId, detalhe: { voltou_de: f.fica, evento: eventoId } },
    ])
  } catch (e) {
    return { error: `Desfazer a junção parou no meio — ${(e as Error).message}` }
  }
  await svc.from('eventos').insert({ empresa_id: empresaId, tipo: 'negocio.juncao_desfeita', entidade: 'evento', entidade_id: eventoId, dados: { fica: f.fica, sai: f.sai }, por_usuario: userId })
  return { error: null }
}
