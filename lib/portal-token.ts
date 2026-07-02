import { createServiceClient } from '@/lib/supabase/service'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Token secreto por empresa para autenticar o webhook de leads dos portais.
 * Guardado em configuracoes_sistema (chave 'portal_leads'). Gerado sob demanda.
 * NÃO reutiliza nenhum segredo da Meta.
 */
export async function getOrCreatePortalToken(svc: Svc, empresaId: number): Promise<string> {
  const { data } = await svc
    .from('configuracoes_sistema')
    .select('valor')
    .eq('empresa_id', empresaId)
    .eq('chave', 'portal_leads')
    .maybeSingle()

  const existing = (data?.valor as { token?: string } | null)?.token
  if (existing) return existing

  const token = crypto.randomUUID().replace(/-/g, '')
  await svc.from('configuracoes_sistema').upsert(
    { empresa_id: empresaId, chave: 'portal_leads', valor: { token } },
    { onConflict: 'empresa_id,chave' },
  )
  return token
}

/** Lê o token sem criar (para validação no webhook). */
export async function getPortalToken(svc: Svc, empresaId: number): Promise<string | null> {
  const { data } = await svc
    .from('configuracoes_sistema')
    .select('valor')
    .eq('empresa_id', empresaId)
    .eq('chave', 'portal_leads')
    .maybeSingle()
  return (data?.valor as { token?: string } | null)?.token ?? null
}
