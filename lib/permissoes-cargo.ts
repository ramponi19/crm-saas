/**
 * PERMISSÕES DO CARGO, PARTE PURA (etapa 1.1b, 25/11/2026). Sem nada de servidor: pode ser importada por código
 * que chega ao navegador (lib/escopo.ts entra no painel). O contexto da sessão (servidor) fica em lib/sessao.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PermissoesPapel } from '@/lib/permissoes'

export type Permissao =
  | 'core.ver_leads_outros' | 'core.ver_vendas_outros' | 'core.ver_relatorios' | 'core.ver_financeiro'
  | 'core.exportar' | 'core.excluir' | 'lojas.ver_rede' | 'config.editar' | 'equipe.cargos' | 'auditoria.ver'
  | 'estoque.ver_custo' | 'estoque.preco_variante' | 'estoque.preco_proprio'

export interface ContextoSessao {
  usuario_id: string
  empresa_id: number | null
  filial_atual: number | null
  loja_da_pessoa: number | null
  plataforma: boolean
  superadmin: boolean
  papel: 'owner' | 'admin' | 'vendedor' | 'tecnico' | null
  cargo: { id: number; nome: string; sistema: boolean; somente_leitura: boolean } | null
  somente_leitura: boolean
  permissoes: string[]
  empresas: { id: number; nome: string }[]
}

export function temPermissao(ctx: Pick<ContextoSessao, 'permissoes'> | null | undefined, p: Permissao): boolean {
  return !!ctx && ctx.permissoes.includes(p)
}

/**
 * As 6 permissões antigas (`lib/permissoes.ts`) a partir do cargo, para os leitores de hoje trocarem de fonte
 * sem mudar de forma. `descontoMax` não tem efeito em lugar nenhum (volta no §F do PDV v2); fica o padrão.
 */
export function permsDoContexto(ctx: Pick<ContextoSessao, 'permissoes' | 'papel'> | null | undefined): PermissoesPapel {
  const tem = (p: Permissao) => temPermissao(ctx, p)
  return {
    verFinanceiro: tem('core.ver_financeiro'),
    verRelatorios: tem('core.ver_relatorios'),
    verLeadsOutros: tem('core.ver_leads_outros'),
    verVendasOutros: tem('core.ver_vendas_outros'),
    excluir: tem('core.excluir'),
    exportar: tem('core.exportar'),
    descontoMax: ctx?.papel === 'owner' || ctx?.papel === 'admin' ? 100 : ctx?.papel === 'tecnico' ? 0 : 10,
  }
}

/** Para onde mandar quem está logado mas sem empresa resolvida (pura, testada). */
export function destinoSemEmpresa(ctx: Pick<ContextoSessao, 'superadmin' | 'empresas'> | null): string {
  if (!ctx) return '/login'
  if (ctx.empresas.length > 1) return '/escolher-empresa'
  if (ctx.superadmin) return '/superadmin'
  return '/register'
}

/** Todas as permissões do catálogo (o Dono e a plataforma têm todas). Mesma lista de permissoes_catalogo. */
export const TODAS_AS_PERMISSOES: Permissao[] = [
  'core.ver_leads_outros', 'core.ver_vendas_outros', 'core.ver_relatorios', 'core.ver_financeiro', 'core.exportar',
  'core.excluir', 'lojas.ver_rede', 'config.editar', 'equipe.cargos', 'auditoria.ver',
  'estoque.ver_custo', 'estoque.preco_variante', 'estoque.preco_proprio',
]

/**
 * Papel e permissões do vínculo de UM usuário numa empresa, lidos das tabelas (para quem recebe o cliente e o
 * usuário de fora, como o assistente e o escopo, às vezes com a chave de serviço). Sem vínculo: nada.
 */
export async function permissoesDoVinculo(
  db: SupabaseClient<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  empresaId: number, userId: string,
): Promise<{ papel: ContextoSessao['papel']; permissoes: string[] }> {
  const { data } = await (db as unknown as SupabaseClient).from('empresa_usuarios')
    .select('role, cargo:empresa_cargos!empresa_usuarios_cargo_fk(sistema, permissoes:empresa_cargo_permissoes(permissao))')
    .eq('empresa_id', empresaId).eq('usuario_id', userId).eq('ativo', true).maybeSingle()
  const linha = data as { role: string | null; cargo: { sistema: boolean; permissoes: { permissao: string }[] } | null } | null
  if (!linha) return { papel: null, permissoes: [] }
  const papel = (linha.role ?? null) as ContextoSessao['papel']
  if (linha.cargo?.sistema) return { papel, permissoes: [...TODAS_AS_PERMISSOES] }
  return { papel, permissoes: (linha.cargo?.permissoes ?? []).map((p) => p.permissao) }
}
