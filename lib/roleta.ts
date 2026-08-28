import { createServiceClient } from '@/lib/supabase/service'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Quem pode receber um lead daquela loja.
 *
 * ⚠️ Existe porque a roleta sorteava entre TODOS os funcionários da empresa,
 * sem olhar loja. Desde que `leads` ganhou `filial_id`, um lead de Jaguariúna
 * podia cair para um vendedor de Mogi — que, pela RLS, não enxerga esse lead.
 * O lead ficava com dono e invisível para o dono, e ninguém reclamava porque
 * ninguém via. É a pior forma de perder um lead.
 *
 * Espelha exatamente a regra de `filiais_visiveis()`, e por isso trata dois
 * casos que parecem detalhe e não são:
 *
 *  - Empresa com MENOS DE DUAS lojas não tem nada a separar: devolve todo mundo,
 *    igual a antes. É o que mantém a mudança inerte para os outros tenants.
 *  - Funcionário SEM loja atribuída conta como sendo da matriz, porque é
 *    exatamente onde a RLS o coloca. Sem isto, a matriz de uma rede recém-criada
 *    ficaria sem ninguém elegível no dia em que a segunda loja abrisse.
 */
export async function membrosElegiveis(
  svc: Svc,
  empresaId: number,
  filialId: number | null | undefined,
): Promise<{ ids: string[]; loja: number | null }> {
  // `ausente` fora da roleta: quem está no almoço acabou de LIBERAR os leads
  // dele. Entregar um novo no mesmo instante desfaria o pedido e deixaria o
  // cliente esperando exatamente quem não está.
  const [{ data: membros }, { data: lojas }] = await Promise.all([
    svc.from('empresa_usuarios')
      .select('usuario_id, filial_id')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .eq('ausente', false)
      .order('usuario_id', { ascending: true }),
    svc.from('filiais')
      .select('id, matriz')
      .eq('empresa_id', empresaId)
      .eq('ativo', true),
  ])

  const todos = (membros ?? []) as Array<{ usuario_id: string | null; filial_id: number | null }>
  const ativos = todos.filter(m => m.usuario_id)

  const filiais = (lojas ?? []) as Array<{ id: number; matriz: boolean }>
  if (filiais.length < 2) {
    return { ids: ativos.map(m => m.usuario_id as string), loja: null }
  }

  const matriz = filiais.find(f => f.matriz)?.id ?? null
  const alvo = filialId ?? matriz
  if (alvo == null) return { ids: [], loja: null }

  const ids = ativos
    .filter(m => m.filial_id === alvo || (m.filial_id == null && alvo === matriz))
    .map(m => m.usuario_id as string)

  return { ids, loja: alvo }
}

/**
 * Roleta de leads — distribuição round-robin (fila circular) entre quem trabalha
 * na loja do lead. O ponteiro do último atribuído fica em
 * `configuracoes_sistema`. Retorna o usuario_id do próximo responsável, ou null
 * quando não há ninguém elegível.
 *
 * Sem responsável é MELHOR que responsável errado: o lead cai na esteira, onde
 * aparece para quem pode pegá-lo. Atribuído a alguém de outra loja, ele some.
 */
export async function proximoResponsavel(
  svc: Svc,
  empresaId: number,
  filialId?: number | null,
): Promise<string | null> {
  const { ids, loja } = await membrosElegiveis(svc, empresaId, filialId)
  if (ids.length === 0) return null

  /**
   * UM PONTEIRO POR LOJA, e isso não é refinamento.
   *
   * Com ponteiro único e listas por loja, o último atribuído quase nunca está na
   * lista da vez: `indexOf` devolve -1 e a conta sempre cai em `ids[0]`. O
   * rodízio viraria "o primeiro da lista recebe tudo", em silêncio.
   */
  const chave = loja == null ? 'roleta_leads' : `roleta_leads:${loja}`

  const { data: cfg } = await svc
    .from('configuracoes_sistema')
    .select('valor')
    .eq('empresa_id', empresaId)
    .eq('chave', chave)
    .maybeSingle()

  const ultimo = (cfg?.valor as { ultimo_usuario_id?: string } | null)?.ultimo_usuario_id ?? null
  const idxUltimo = ultimo ? ids.indexOf(ultimo) : -1
  const proximo = ids[(idxUltimo + 1) % ids.length]

  await svc.from('configuracoes_sistema').upsert(
    { empresa_id: empresaId, chave, valor: { ultimo_usuario_id: proximo } },
    { onConflict: 'empresa_id,chave' },
  )

  return proximo
}
