import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * FUSÃO DE CONTATOS QUE SE DESFAZ (03/11/2026).
 *
 * A fusão é a `core_fundir_contatos` do banco: o contato `principal` fica, o
 * `removido` sai, e tudo que apontava para ele passa para o principal. O registro
 * em `contato_fusoes.movido` guardava só contagens — não dava para voltar atrás.
 *
 * Agora, antes de fundir, a rota tira a FOTO do que vai mudar e a guarda no
 * próprio registro (`movido._desfazer`), sem migração:
 *
 *   principal, removido    as duas linhas de `contatos`, inteiras
 *   conversasFundidas      conversas do removido no mesmo canal de uma do principal:
 *                          a função move as mensagens e APAGA a conversa — a foto
 *                          guarda a linha e os ids das mensagens
 *   identidadesApagadas    identidades repetidas (mesmo canal e id externo) que
 *                          morrem com o removido — a linha inteira
 *   identidadesMovidas     as que passam para o principal (ids)
 *   linhas                 tabela.coluna → ids que apontavam para o removido
 *
 * `desfazerFusao` faz o caminho de volta com os mesmos ids. O que chegou DEPOIS
 * da fusão (mensagem nova, negócio novo) fica com o principal: não é da fusão.
 *
 * Tudo pelo serviço (as rotas já conferiram dono/admin). PostgREST não abre
 * transação: cada passo devolve o nome se falhar, para não esconder um meio-termo.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>
type Linha = Record<string, unknown>

/** Tabelas com chave estrangeira para `contatos` que a fusão move (fora identidades e o próprio registro). */
export const TABELAS_DO_CONTATO: { tabela: string; coluna: string }[] = [
  { tabela: 'assistencia_garantias', coluna: 'cliente_id' },
  { tabela: 'assistencia_orcamentos', coluna: 'cliente_id' },
  { tabela: 'avaliacao_cotacoes', coluna: 'cliente_id' },
  { tabela: 'conversas', coluna: 'contato_id' },
  { tabela: 'estoque_unidades', coluna: 'cliente_id' },
  { tabela: 'financeiro_cobrancas', coluna: 'cliente_id' },
  { tabela: 'imoveis_imoveis', coluna: 'proprietario_id' },
  { tabela: 'imoveis_negocios', coluna: 'cliente_id' },
  { tabela: 'imoveis_perfis_busca', coluna: 'cliente_id' },
  { tabela: 'mensagens', coluna: 'contato_id' },
  { tabela: 'negocios', coluna: 'contato_id' },
  { tabela: 'tarefas', coluna: 'contato_id' },
  { tabela: 'vendas_contratos', coluna: 'cliente_id' },
  { tabela: 'vendas_vendas', coluna: 'cliente_id' },
  { tabela: 'visitas', coluna: 'cliente_id' },
]

/** Campos que a fusão preenche no principal quando ele os tinha vazios (coalesce). */
const CAMPOS_COALESCE = ['nome', 'telefone', 'telefone_e164', 'email', 'cpf_cnpj', 'instagram', 'foto_url',
  'origem', 'origem_id', 'responsavel_id', 'observacoes'] as const

export interface FotoDaFusao {
  versao: 1
  principal: Linha
  removido: Linha
  conversasFundidas: { conversa: Linha; destino: number; mensagens: number[] }[]
  identidadesApagadas: Linha[]
  identidadesMovidas: number[]
  linhas: Record<string, number[]>
}

/** ids de uma tabela onde `coluna = valor`, de mil em mil (o PostgREST corta em mil). */
async function ids(db: Db, tabela: string, coluna: string, valor: number): Promise<number[]> {
  const out: number[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from(tabela).select('id').eq(coluna, valor).order('id').range(de, de + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    const lote = (data ?? []) as { id: number }[]
    out.push(...lote.map((r) => r.id))
    if (lote.length < 1000) return out
  }
}

/** A foto do que a fusão de `removido` em `principal` vai mudar. Nula = algum dos dois não é da empresa. */
export async function fotoDaFusao(svc: Db, empresaId: number, principalId: number, removidoId: number): Promise<FotoDaFusao | null> {
  const { data: contatos } = await svc.from('contatos').select('*').eq('empresa_id', empresaId).in('id', [principalId, removidoId])
  const principal = (contatos ?? []).find((c: Linha) => c.id === principalId) as Linha | undefined
  const removido = (contatos ?? []).find((c: Linha) => c.id === removidoId) as Linha | undefined
  if (!principal || !removido) return null

  const [{ data: convR }, { data: convP }, { data: idR }, { data: idP }] = await Promise.all([
    svc.from('conversas').select('*').eq('contato_id', removidoId),
    svc.from('conversas').select('id, canal_id').eq('contato_id', principalId),
    svc.from('contato_identidades').select('*').eq('contato_id', removidoId),
    svc.from('contato_identidades').select('canal_tipo, external_id').eq('contato_id', principalId),
  ])

  // Mesma regra da função: canal igual (nulo casa com nulo) → mensagens vão para a do principal.
  const conversasFundidas: FotoDaFusao['conversasFundidas'] = []
  for (const c of (convR ?? []) as Linha[]) {
    const destino = ((convP ?? []) as Linha[]).find((p) => (p.canal_id ?? null) === (c.canal_id ?? null))
    if (destino) conversasFundidas.push({ conversa: c, destino: destino.id as number, mensagens: await ids(svc, 'mensagens', 'conversa_id', c.id as number) })
  }

  const chaveP = new Set(((idP ?? []) as Linha[]).map((i) => `${i.canal_tipo}|${i.external_id}`))
  const identidadesApagadas = ((idR ?? []) as Linha[]).filter((i) => chaveP.has(`${i.canal_tipo}|${i.external_id}`))
  const identidadesMovidas = ((idR ?? []) as Linha[]).filter((i) => !chaveP.has(`${i.canal_tipo}|${i.external_id}`)).map((i) => i.id as number)

  const linhas: Record<string, number[]> = {}
  for (const { tabela, coluna } of TABELAS_DO_CONTATO) {
    const lista = await ids(svc, tabela, coluna, removidoId)
    if (lista.length) linhas[`${tabela}.${coluna}`] = lista
  }

  return { versao: 1, principal, removido, conversasFundidas, identidadesApagadas, identidadesMovidas, linhas }
}

/**
 * FUNDE `removido` em `principal` (core_fundir_contatos) com a foto para desfazer —
 * a mesma operação para o card do lead (/api/contatos/fundir) e para a tela de
 * Clientes (/api/clientes/fundir, desde 05/11/2026). Devolve o id do registro em
 * `contato_fusoes`, que é o que o desfazer recebe.
 */
export async function fundirContatos(svc: Db, empresaId: number, principalId: number, removidoId: number, userId: string):
  Promise<{ error: string; status: number } | { error: null; movido: Record<string, number>; fusaoId: number | null; nomeRemovido: string | null }> {
  // A foto ANTES de fundir: é dela que o desfazer reconstrói tudo.
  let foto: FotoDaFusao | null
  try { foto = await fotoDaFusao(svc, empresaId, principalId, removidoId) } catch (e) {
    return { error: `Não consegui guardar a foto para desfazer: ${(e as Error).message}`, status: 500 }
  }
  if (!foto) return { error: 'Contato não encontrado nesta empresa', status: 404 }
  // A função confere de novo que os dois são desta empresa; aqui só se traduz o erro.
  const { data: movido, error } = await svc.rpc('core_fundir_contatos', { p_empresa: empresaId, p_principal: principalId, p_removido: removidoId })
  if (error) return { error: error.message, status: 400 }

  // Quem fundiu (pelo serviço o auth.uid() da função é nulo) e a foto para desfazer.
  const { data: registro } = await svc.from('contato_fusoes').select('id, movido')
    .eq('empresa_id', empresaId).eq('contato_principal_id', principalId).eq('contato_removido_id', removidoId)
    .order('id', { ascending: false }).limit(1).maybeSingle()
  if (registro) {
    await svc.from('contato_fusoes').update({
      por_usuario: userId,
      movido: { ...((registro.movido ?? {}) as Linha), _desfazer: foto },
    }).eq('id', registro.id)
  }
  await svc.from('eventos').update({ por_usuario: userId })
    .eq('empresa_id', empresaId).eq('tipo', 'contato.fundido').eq('entidade_id', principalId).is('por_usuario', null)

  return { error: null, movido: (movido ?? {}) as Record<string, number>, fusaoId: (registro?.id as number | undefined) ?? null, nomeRemovido: (foto.removido.nome as string | null) ?? null }
}

const EM_LOTES = 500
async function emLotes(lista: number[], f: (lote: number[]) => PromiseLike<{ error: { message: string } | null }>, passo: string) {
  for (let i = 0; i < lista.length; i += EM_LOTES) {
    const { error } = await f(lista.slice(i, i + EM_LOTES))
    if (error) throw new Error(`${passo}: ${error.message}`)
  }
}

const sem = (l: Linha, ...fora: string[]) => Object.fromEntries(Object.entries(l).filter(([k]) => !fora.includes(k)))

/**
 * Desfaz uma fusão registrada. Devolve o que voltou ou o erro (com o passo).
 * Recusa fusão sem foto (anterior a 03/11/2026), já desfeita, de outra empresa,
 * ou com o contato removido existindo de novo.
 */
export async function desfazerFusao(svc: Db, empresaId: number, fusaoId: number, userId: string):
  Promise<{ error: string | null; status?: number; contato?: number; voltou?: Record<string, number> }> {
  const { data: f } = await svc.from('contato_fusoes').select('id, empresa_id, contato_principal_id, contato_removido_id, movido').eq('id', fusaoId).maybeSingle()
  if (!f || f.empresa_id !== empresaId) return { error: 'Fusão não encontrada', status: 404 }
  const movido = (f.movido ?? {}) as Linha
  if (movido._desfeita) return { error: 'Esta fusão já foi desfeita', status: 409 }
  const foto = movido._desfazer as FotoDaFusao | undefined
  if (!foto || foto.versao !== 1) return { error: 'Esta fusão não guardou a foto para desfazer (anterior a 03/11/2026)', status: 409 }
  const removidoId = foto.removido.id as number
  const principalId = f.contato_principal_id as number
  const { count: existe } = await svc.from('contatos').select('id', { count: 'exact', head: true }).eq('id', removidoId)
  if (existe) return { error: 'O contato removido já existe de novo', status: 409 }
  const { data: principalAgora } = await svc.from('contatos').select('*').eq('id', principalId).maybeSingle()
  if (!principalAgora) return { error: 'O contato que ficou não existe mais', status: 409 }

  const voltou: Record<string, number> = {}
  try {
    // 1. O principal devolve o que a fusão preencheu (só onde estava vazio e segue igual ao do removido).
    const antes = foto.principal, rem = foto.removido
    const patch: Linha = {}
    for (const k of CAMPOS_COALESCE) {
      if (antes[k] == null && principalAgora[k] != null && principalAgora[k] === rem[k]) patch[k] = null
    }
    patch.endereco = antes.endereco
    patch.dados = antes.dados
    const r1 = await svc.from('contatos').update(patch).eq('id', principalId)
    if (r1.error) throw new Error(`contato que ficou: ${r1.error.message}`)

    // 2. O removido volta, com o mesmo id.
    const r2 = await svc.from('contatos').insert(rem)
    if (r2.error) throw new Error(`contato que saiu: ${r2.error.message}`)
    voltou.contatos = 1

    // 3. As conversas que a fusão apagou voltam (com o mesmo id), e as mensagens delas.
    for (const cf of foto.conversasFundidas) {
      const r3 = await svc.from('conversas').insert(cf.conversa)
      if (r3.error) throw new Error(`conversa ${cf.conversa.id}: ${r3.error.message}`)
      await emLotes(cf.mensagens, (lote) => svc.from('mensagens').update({ conversa_id: cf.conversa.id }).in('id', lote), `mensagens da conversa ${cf.conversa.id}`)
    }
    if (foto.conversasFundidas.length) voltou['conversas recriadas'] = foto.conversasFundidas.length

    // 4. Cada linha que apontava para o removido volta a apontar para ele.
    for (const [chave, lista] of Object.entries(foto.linhas)) {
      const [tabela, coluna] = chave.split('.')
      await emLotes(lista, (lote) => svc.from(tabela).update({ [coluna]: removidoId }).in('id', lote).eq(coluna, principalId), chave)
      voltou[chave] = lista.length
    }

    // 5. Identidades: as movidas voltam; as repetidas, que morreram com o removido, renascem.
    await emLotes(foto.identidadesMovidas, (lote) => svc.from('contato_identidades').update({ contato_id: removidoId }).in('id', lote), 'identidades')
    if (foto.identidadesApagadas.length) {
      const r5 = await svc.from('contato_identidades').insert(foto.identidadesApagadas)
      if (r5.error) throw new Error(`identidades apagadas: ${r5.error.message}`)
    }
    if (foto.identidadesMovidas.length + foto.identidadesApagadas.length) voltou.identidades = foto.identidadesMovidas.length + foto.identidadesApagadas.length

    // 6. Não lidas da conversa do principal que tinha recebido as mensagens (o gatilho
    //    só reconta a conversa de DESTINO de cada mensagem).
    for (const destino of new Set(foto.conversasFundidas.map((c) => c.destino))) {
      const { count } = await svc.from('mensagens').select('id', { count: 'exact', head: true })
        .eq('conversa_id', destino).eq('direcao', 'recebida').eq('lida', false)
      await svc.from('conversas').update({ nao_lidas: count ?? 0 }).eq('id', destino)
    }
  } catch (e) {
    return { error: `Desfazer parou no meio — ${(e as Error).message}`, status: 500, voltou }
  }

  const em = new Date().toISOString()
  await svc.from('contato_fusoes').update({ movido: { ...sem(movido, '_desfeita'), _desfeita: { em, por: userId, voltou } } }).eq('id', fusaoId)
  await svc.from('eventos').insert({
    empresa_id: empresaId, tipo: 'contato.fusao_desfeita', entidade: 'contato', entidade_id: removidoId,
    dados: { fusao: fusaoId, principal: principalId, voltou }, por_usuario: userId,
  })
  return { error: null, contato: removidoId, voltou }
}
