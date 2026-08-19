import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calcularRanking, valorMetrica } from '@/lib/ranking'
import { moduloDoSegmento, SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { imoveisCaptadosPorPessoa } from '@/lib/captacao-imob'
import { janelaDoPeriodo } from '@/lib/ranking'
import { RankingView, type MetaUi, type MembroOpt } from './ranking-view'

export const metadata = { title: 'Ranking & Metas' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const empresaId = await getEmpresaId()
  if (!empresaId) redirect('/dashboard')

  const now = new Date()
  const sp = await searchParams
  const periodo = /^\d{4}-\d{2}$/.test(sp.periodo ?? '') ? sp.periodo! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [{ data: vinculo }, { data: usuario }, { data: empresa }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
    supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle(),
  ])

  /**
   * A config do BANCO manda, com o código como reserva.
   *
   * `segmentos_config.modulos_extra` é o que o `resolverMenu` usa para montar o menu.
   * Se esta trava olhasse só o código, bastaria alguém mexer no banco para o item
   * sumir do menu e a página seguir aberta — ou o contrário, item levando a redirect.
   */
  const { data: segCfg } = await supabase.from('segmentos_config')
    .select('modulos_extra').eq('chave', empresa?.segmento ?? 'varejo').eq('ativo', true).maybeSingle()
  const extrasBanco = segCfg?.modulos_extra as { href?: string }[] | null | undefined
  const isAdmin = !!(usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin')

  /**
   * QUEM VÊ O PLACAR DEPENDE DO SEGMENTO.
   *
   * O ranking compara o resultado de todo mundo. Na JM isso é tela de gestão: ela
   * saiu do menu do CRM a pedido do dono, e tirar do menu não bastaria — sem trava
   * o vendedor veria o faturamento dos colegas digitando a URL, justamente o que o
   * isolamento por vendedor existe para impedir.
   *
   * Na imobiliária o dono decidiu o contrário (19/08/2026): placar aberto ao time.
   * Quem responde é `moduloDoSegmento` — a MESMA fonte que monta o menu, para que
   * o item nunca apareça levando a um redirect nem exista tela sem porta.
   *
   * Editar meta continua sendo de dono/admin: a view recebe `isAdmin` e esconde
   * criar e excluir, e a rota /api/ranking/metas confere de novo.
   */
  const abertoAoTime = Array.isArray(extrasBanco)
    ? extrasBanco.some((m) => m?.href === '/ranking')
    : moduloDoSegmento(empresa?.segmento, '/ranking')
  if (!isAdmin && !abertoAoTime) redirect('/dashboard')

  /**
   * Captação de imóvel entra só onde o segmento capta ativo.
   *
   * A consulta é feita AQUI porque só esta página sabe o segmento; `calcularRanking`
   * recebe o número pronto e segue neutro. Quem não capta ativo nem paga a consulta.
   */
  const captaImovel = !!SEGMENTOS[normalizarSegmento(empresa?.segmento)].capacidades.captacaoDeImovel
  const janela = janelaDoPeriodo(periodo)
  const captacoesImovel = captaImovel
    ? await imoveisCaptadosPorPessoa(supabase, empresaId, janela.ini, janela.fim)
    : undefined

  const [linhas, { data: metasRaw }, { data: membrosRaw }] = await Promise.all([
    calcularRanking(supabase, empresaId, periodo, { imoveisCaptados: captacoesImovel }),
    supabase.from('metas').select('id, escopo, usuario_id, tipo, alvo, periodo').eq('empresa_id', empresaId).eq('periodo', periodo).order('id', { ascending: true }),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  const linhaByUser = new Map(linhas.map((l) => [l.usuario_id, l]))
  const nomeByUser = new Map(linhas.map((l) => [l.usuario_id, l.nome]))

  const metas: MetaUi[] = (metasRaw ?? []).map((m) => {
    const realizado = m.escopo === 'equipe'
      ? linhas.reduce((s, l) => s + valorMetrica(l, m.tipo), 0)
      : valorMetrica(linhaByUser.get(m.usuario_id ?? ''), m.tipo)
    return {
      id: m.id, escopo: m.escopo, tipo: m.tipo, alvo: Number(m.alvo) || 0,
      usuario_nome: m.escopo === 'equipe' ? 'Equipe' : (nomeByUser.get(m.usuario_id ?? '') ?? '—'),
      realizado,
    }
  })

  type MembroRow = { usuario_id: string; usuarios: Embed<{ nome: string | null }> }
  const membros: MembroOpt[] = ((membrosRaw ?? []) as unknown as MembroRow[]).map((m) => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))

  return <RankingView periodo={periodo} linhas={linhas} metas={metas} membros={membros} isAdmin={isAdmin} mostrarImoveis={captaImovel} />
}
