import { getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { envelopesDaConfig, resolverConfig } from '@/lib/config'
import { DistribuicaoPorLoja, type DadosDistribuicao, type ValorLiberacao } from '@/components/modules/configuracoes/distribuicao-por-loja'

export const metadata = { title: 'Distribuição' }

type Lista = 'roleta' | 'liberacao' | 'reserva_posvenda'

/**
 * CONFIGURAÇÕES › VENDAS E ATENDIMENTO › DISTRIBUIÇÃO (5b, 26/11/2026). Uma aba por loja com as listas da roleta, da
 * liberação diária e da reserva do pós-venda, a liberação diária (ligar, lote por pessoa) e a loja da comissão de cada
 * pessoa. Só dono/admin (layout do grupo; as funções do banco conferem de novo ao gravar). A leitura é pela chave de
 * serviço, filtrada pela empresa da sessão (precisa das lojas que cada pessoa enxerga).
 */
export default async function Page() {
  const empresaId = (await getEmpresaId())!
  const svc = createServiceClient()
  const s = svc as unknown as import('@supabase/supabase-js').SupabaseClient

  const [{ data: lojas }, { data: vinculos }, { data: cabecalhos }, { data: participantes }, { data: comissoes }, config] = await Promise.all([
    svc.from('filiais').select('id, nome, cidade, matriz').eq('empresa_id', empresaId).eq('ativo', true)
      .order('matriz', { ascending: false }).order('nome'),
    svc.from('empresa_usuarios').select('usuario_id, role, filial_id, ausente, conta_servico, participa_roleta, usuarios!empresa_usuarios_usuario_public_fkey(nome)')
      .eq('empresa_id', empresaId).eq('ativo', true),
    s.from('distribuicao_listas').select('filial_id, lista').eq('empresa_id', empresaId),
    s.from('distribuicao_participantes').select('filial_id, lista, usuario_id, ordem').eq('empresa_id', empresaId).order('ordem'),
    s.from('empresa_usuario_comissao').select('usuario_id, filial_id').eq('empresa_id', empresaId),
    envelopesDaConfig(svc, empresaId, { chaves: ['distribuicao.liberacao_diaria'] }),
  ])

  type Vinculo = { usuario_id: string; role: string; filial_id: number | null; ausente: boolean | null; conta_servico: boolean; participa_roleta: boolean; usuarios: { nome: string | null } | { nome: string | null }[] | null }
  const vs = ((vinculos ?? []) as unknown as Vinculo[]).filter((v) => v.usuario_id)
  const listaLojas = (lojas ?? []) as { id: number; nome: string; cidade: string | null; matriz: boolean }[]
  const matriz = listaLojas.find((l) => l.matriz)?.id ?? listaLojas[0]?.id ?? null

  // Lojas que cada pessoa enxerga (5a): só entra na lista de uma loja quem a enxerga.
  const atuacao = await Promise.all(vs.map(async (v) => {
    const { data } = await s.rpc('filiais_atuacao_de', { p_usuario: v.usuario_id, p_empresa: empresaId })
    return [v.usuario_id, (Array.isArray(data) ? data : []).map(Number)] as const
  }))
  const lojasDe = new Map(atuacao)

  const configuradas = new Set(((cabecalhos ?? []) as { filial_id: number; lista: Lista }[]).map((c) => `${c.filial_id}:${c.lista}`))
  const parts = (participantes ?? []) as { filial_id: number; lista: Lista; usuario_id: string }[]
  const comissaoDe = new Map(((comissoes ?? []) as { usuario_id: string; filial_id: number }[]).map((c) => [c.usuario_id, Number(c.filial_id)]))
  const env = config['distribuicao.liberacao_diaria']

  const dados: DadosDistribuicao = {
    lojas: listaLojas.map((l) => {
      const lista = (q: Lista): { ids: string[]; configurada: boolean } => {
        if (configuradas.has(`${l.id}:${q}`)) return { ids: parts.filter((p) => p.filial_id === l.id && p.lista === q).map((p) => p.usuario_id), configurada: true }
        if (q === 'reserva_posvenda') return { ids: [], configurada: false }
        // Sem lista configurada: a regra de antes (participa da roleta, loja principal = esta).
        return {
          ids: vs.filter((v) => !v.conta_servico && v.participa_roleta && (listaLojas.length < 2 || (v.filial_id ?? matriz) === l.id)).map((v) => v.usuario_id).sort(),
          configurada: false,
        }
      }
      const lib = resolverConfig(env, l.id, { ativo: false }) as Partial<ValorLiberacao> | null
      return {
        id: l.id, nome: l.cidade ? `${l.nome} · ${l.cidade}` : l.nome,
        roleta: lista('roleta'), liberacao: lista('liberacao'), reserva: lista('reserva_posvenda'),
        liberacaoValor: {
          ativo: lib?.ativo === true, por_vendedor: Number(lib?.por_vendedor ?? 10), dias_cliente: Number(lib?.dias_cliente ?? 14),
          pular_primeiro_dia: lib?.pular_primeiro_dia === true,
        },
      }
    }),
    pessoas: vs.map((v) => {
      const u = Array.isArray(v.usuarios) ? v.usuarios[0] : v.usuarios
      return {
        id: v.usuario_id, nome: u?.nome ?? '—', papel: v.role, ausente: !!v.ausente, contaServico: v.conta_servico,
        lojas: lojasDe.get(v.usuario_id) ?? [],
        lojaComissao: comissaoDe.get(v.usuario_id) ?? v.filial_id ?? matriz,
      }
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  }

  return <DistribuicaoPorLoja dados={dados} />
}
