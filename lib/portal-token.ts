import { createServiceClient } from '@/lib/supabase/service'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Token por empresa que autentica a entrada de leads dos portais e do site
 * (`Authorization: Bearer`). NÃO reutiliza nenhum segredo da Meta.
 *
 * ══ SEM TOKEN ATÉ A PRIMEIRA MIGRAÇÃO DA VIAGEM (22/10/2026) ════════════════════
 *
 * Até aqui o token ficava em texto em `configuracoes_sistema` ('portal_leads') e
 * era CRIADO a cada visita à tela de Integrações — para qualquer empresa, mesmo
 * sem portal: a JM e a Preview tinham um sem nunca terem usado. As linhas foram
 * apagadas em 22/10 (registro no 06, seção 13).
 *
 * O lugar novo é `empresa_segredos`, cifrado, e o token nasce quando o módulo
 * Imóveis é instalado — primeira migração da viagem (05, "Para a viagem"), junto
 * com `modulo_pedidos.status`. Até lá nenhuma empresa tem token, e as rotas de
 * portal e de site respondem 401 a qualquer chamada.
 */
export async function getPortalToken(_svc: Svc, _empresaId: number): Promise<string | null> {
  void _svc; void _empresaId
  return null
}
