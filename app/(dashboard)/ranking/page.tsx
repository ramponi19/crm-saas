import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calcularRanking, valorMetrica } from '@/lib/ranking'
import { imoveisCaptadosPorPessoa } from '@/lib/captacao-imob'
import { janelaDoPeriodo } from '@/lib/ranking'
import { RankingView, type MetaUi, type MembroOpt } from './ranking-view'
import { capacidades, carregarConfigEmpresa, vocabulario } from '@/lib/empresa-config'

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

  /**
   * A trava lê a MESMA base que monta o menu (empresa_menu.itens.base): os extras
   * dela são o que o `resolverMenu` põe no menu. Se a trava olhasse outra fonte,
   * o item poderia sumir do menu com a página aberta — ou levar a um redirect.
   */
  const [{ data: vinculo }, { data: usuario }, cfg] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
    carregarConfigEmpresa(supabase, empresaId),
  ])
  const base = cfg.base
  const isAdmin = !!(usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin')

  /**
   * QUEM VÊ O PLACAR DEPENDE DA EMPRESA.
   *
   * O ranking compara o resultado de todo mundo. Na JM isso é tela de gestão: ela
   * saiu do menu do CRM a pedido do dono, e tirar do menu não bastaria — sem trava
   * o vendedor veria o faturamento dos colegas digitando a URL, justamente o que o
   * isolamento por vendedor existe para impedir.
   *
   * Na imobiliária o dono decidiu o contrário (19/08/2026): placar aberto ao time.
   * Quem responde é a base da empresa — a MESMA camada que monta o menu (o /ranking
   * declarado nos extras da base), para que o item nunca apareça levando a um
   * redirect nem exista tela sem porta.
   *
   * Editar meta continua sendo de dono/admin: a view recebe `isAdmin` e esconde
   * criar e excluir, e a rota /api/ranking/metas confere de novo.
   */
  /*
   * `modulos_extra = []` no banco é "não configurado", não "nenhum extra": o array
   * vazio — o estado real da imobiliária em 20/08/2026 — mandava todo corretor para
   * o /dashboard. Desde 29/10/2026 a base gravada já vem com os extras do preset.
   */
  const abertoAoTime = (base.modulosExtra ?? []).some((m) => m?.href === '/ranking')
  if (!isAdmin && !abertoAoTime) redirect('/dashboard')

  /**
   * Captação de imóvel entra só onde o módulo Imóveis está ligado.
   *
   * A consulta é feita AQUI porque só esta página sabe disso; `calcularRanking`
   * recebe o número pronto e segue neutro. Quem não capta ativo nem paga a consulta.
   */
  const captaImovel = !!capacidades(cfg).captacaoDeImovel
  const janela = janelaDoPeriodo(periodo)
  const captacoesImovel = captaImovel
    ? await imoveisCaptadosPorPessoa(supabase, empresaId, janela.ini, janela.fim)
    : undefined

  const [linhas, { data: metasRaw }, { data: membrosRaw }] = await Promise.all([
    calcularRanking(supabase, empresaId, periodo, { imoveisCaptados: captacoesImovel }),
    supabase.from('metas').select('id, escopo, usuario_id, tipo, alvo, periodo').eq('empresa_id', empresaId).eq('periodo', periodo).order('id', { ascending: true }),
    supabase.from('empresa_usuarios').select('usuario_id, role, usuarios!empresa_usuarios_usuario_public_fkey(nome)').eq('empresa_id', empresaId).eq('ativo', true),
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

  type MembroRow = { usuario_id: string; role: string | null; usuarios: Embed<{ nome: string | null }> }
  const membrosRows = (membrosRaw ?? []) as unknown as MembroRow[]
  const membros: MembroOpt[] = membrosRows.map((m) => ({ id: m.usuario_id, nome: one(m.usuarios)?.nome ?? '—' }))

  /**
   * O PAPEL vai junto do nome, como no CRM que o dono usa.
   *
   * Uma linha de ranking sem papel obriga a decorar quem é corretor e quem é
   * administração — e comparar o placar de um gerente com o de quem roda a rua é
   * o mal-entendido clássico de placar de equipe. Vem desta consulta, que a página
   * já fazia para o seletor de pessoa das metas; `lib/ranking` segue neutro.
   */
  const papeis: Record<string, string> = {}
  for (const m of membrosRows) papeis[m.usuario_id] = m.role ?? 'member'

  return (
    <RankingView
      periodo={periodo}
      linhas={linhas}
      metas={metas}
      membros={membros}
      papeis={papeis}
      isAdmin={isAdmin}
      mostrarImoveis={captaImovel}
      equipeLabel={vocabulario(cfg).equipe}
    />
  )
}
