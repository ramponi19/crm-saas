import { createServiceClient } from '@/lib/supabase/service'
import { garantirPortalToken } from '@/lib/portal-token'

type Svc = ReturnType<typeof createServiceClient>

/**
 * O QUE ACONTECE QUANDO UM MÓDULO É INSTALADO (23/10/2026).
 *
 * Um lugar só, chamado pelos dois caminhos que instalam: a Central de Módulos
 * (`/api/modulos/instalar`) e o superadmin atendendo um pedido
 * (`/api/superadmin/modulos/pedidos/[id]`). Hoje só o Imóveis tem o que preparar: o
 * token de portal e do site, cifrado em `empresa_segredos`.
 *
 * Falha aqui NÃO desfaz a instalação: o módulo fica instalado e o erro volta para quem
 * chamou mostrar ("instalado, mas o token não foi gerado").
 */
export async function aoInstalarModulo(svc: Svc, empresaId: number, chave: string): Promise<{ error: string | null }> {
  if (chave === 'imoveis') {
    const { error } = await garantirPortalToken(svc, empresaId)
    return { error }
  }
  return { error: null }
}
