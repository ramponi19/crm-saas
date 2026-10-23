import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { gravarSegredo, lerSegredo } from '@/lib/empresa-segredos'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Token por empresa que autentica a entrada de leads dos portais e do site
 * (`Authorization: Bearer`, lib/token-externo.ts). NÃO reutiliza nenhum segredo da Meta.
 *
 * ══ ONDE MORA (desde a primeira migração da viagem) ════════════════════════════
 *
 * Em `empresa_segredos`, chave `portal_leads`, CIFRADO (lib/empresa-segredos.ts). Nasce quando
 * o módulo Imóveis é instalado (`aoInstalarModulo`, lib/modulos-instalacao.ts) — pela
 * Central de Módulos ou pelo superadmin atendendo um pedido —, e só nesse momento.
 *
 * Até 22/10/2026 ficava em texto em `configuracoes_sistema` e era criado a cada visita
 * à tela de Integrações, para qualquer empresa (a JM e a Preview tinham sem nunca ter
 * usado; linhas apagadas em 22/10). Empresa sem Imóveis não tem token, e as rotas de
 * portal e de site respondem 401.
 */
export const CHAVE_PORTAL = 'portal_leads'

/** Lê o token sem criar (para validar a chamada do portal ou do site). */
export async function getPortalToken(svc: Svc, empresaId: number): Promise<string | null> {
  return lerSegredo(svc, empresaId, CHAVE_PORTAL)
}

/**
 * Gera o token se a empresa ainda não tem. Reinstalar o módulo NÃO troca o token: os
 * portais já configurados com ele continuam recebendo. Devolve se gerou agora.
 */
export async function garantirPortalToken(svc: Svc, empresaId: number): Promise<{ gerado: boolean; error: string | null }> {
  if (await getPortalToken(svc, empresaId)) return { gerado: false, error: null }
  const { error } = await gravarSegredo(svc, empresaId, CHAVE_PORTAL, randomBytes(24).toString('base64url'))
  return { gerado: !error, error }
}
