import type { SupabaseClient } from '@supabase/supabase-js'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'

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
  /** Custo, lucro e margem. */
  verFinanceiro: boolean
}

export async function acessoDoUsuario(
  supabase: SupabaseClient,
  empresaId: number,
  userId: string,
): Promise<Acesso> {
  const [{ data: vinculo }, { data: usuario }, { data: empresa }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role')
      .eq('usuario_id', userId).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('nome, is_super_admin').eq('id', userId).maybeSingle(),
    supabase.from('empresas').select('permissoes').eq('id', empresaId).maybeSingle(),
  ])
  const nome = (usuario?.nome as string | null) || 'Usuário'

  // Super admin é o suporte: precisa conferir a loja inteira.
  if (usuario?.is_super_admin) {
    return { empresaId, userId, nome, papel: 'superadmin', soMinhasVendas: false, soMeusLeads: false, verFinanceiro: true }
  }
  const papel = (vinculo?.role as string | undefined) ?? ''
  if (!papel) {
    return { empresaId, userId, nome, papel: '', soMinhasVendas: true, soMeusLeads: true, verFinanceiro: false }
  }
  const p = permsDoPapel(papel, (empresa?.permissoes ?? null) as PermissoesMap | null)
  return {
    empresaId, userId, nome, papel,
    soMinhasVendas: !p.verVendasOutros,
    soMeusLeads: !p.verLeadsOutros,
    verFinanceiro: p.verFinanceiro,
  }
}
