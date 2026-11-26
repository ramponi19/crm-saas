import type { SupabaseClient } from '@supabase/supabase-js'
import { permissoesDoVinculo, permsDoContexto, temPermissao } from '@/lib/permissoes-cargo'

/**
 * O QUE QUEM PERGUNTA PODE VER — decidido antes de o chat ler qualquer coisa.
 *
 * O chat lê o banco com o login de quem pergunta (cliente com sessão, sob a
 * RLS). Isso já resolve empresa e loja: `filiais_visiveis()` impede que
 * Jaguariúna apareça para quem é de Mogi Guaçu, exatamente como no resto do
 * CRM. O que a RLS NÃO sabe são as permissões de papel que o dono configura —
 * vendedor que não vê venda dos outros, leads dos outros, custo e lucro. Essas
 * moram aqui, e cada ferramenta aplica.
 *
 * FALHA FECHADO, como `lib/escopo.ts`: papel que não deu para ler restringe.
 * Liberar por dúvida é mostrar o faturamento da loja a quem não deve.
 */
export interface Acesso {
  empresaId: number
  userId: string
  nome: string
  papel: string
  /** Só as vendas em que ele é o vendedor. */
  soMinhasVendas: boolean
  /** Só os leads dele — e os sem responsável, que são de todos (ver leads/page.tsx). */
  soMeusLeads: boolean
  /**
   * Custo, lucro e margem: a permissão `estoque.ver_custo` (etapa 1.1e). Antes era `core.ver_financeiro`; o custo
   * tem permissão própria desde a 1.1b e a tela e o chat precisam dizer a mesma coisa para o mesmo cargo.
   */
  verCusto: boolean
}

export async function acessoDoUsuario(
  supabase: SupabaseClient,
  empresaId: number,
  userId: string,
): Promise<Acesso> {
  // Etapa 1.1b: papel e permissões vêm do cargo do vínculo (empresa_cargos), não de empresas.permissoes.
  const [vinculo, { data: usuario }] = await Promise.all([
    permissoesDoVinculo(supabase, empresaId, userId),
    supabase.from('usuarios').select('nome, is_super_admin').eq('id', userId).maybeSingle(),
  ])
  const nome = (usuario?.nome as string | null) || 'Usuário'

  // Super admin é o suporte: precisa conferir a loja inteira.
  if (usuario?.is_super_admin) {
    return { empresaId, userId, nome, papel: 'superadmin', soMinhasVendas: false, soMeusLeads: false, verCusto: true }
  }
  const papel = vinculo.papel ?? ''
  if (!papel) {
    return { empresaId, userId, nome, papel: '', soMinhasVendas: true, soMeusLeads: true, verCusto: false }
  }
  const p = permsDoContexto(vinculo)
  return {
    empresaId, userId, nome, papel,
    soMinhasVendas: !p.verVendasOutros,
    soMeusLeads: !p.verLeadsOutros,
    verCusto: temPermissao(vinculo, 'estoque.ver_custo'),
  }
}
