import { createServiceClient } from '@/lib/supabase/service'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Roleta de leads — distribuição round-robin (fila circular) entre os corretores
 * ativos da empresa. O ponteiro do último atribuído fica em
 * configuracoes_sistema (chave 'roleta_leads'). Retorna o usuario_id do próximo
 * responsável, ou null se não houver corretores ativos.
 */
export async function proximoResponsavel(svc: Svc, empresaId: number): Promise<string | null> {
  const { data: membros } = await svc
    .from('empresa_usuarios')
    .select('usuario_id')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('usuario_id', { ascending: true })

  const ids = (membros ?? []).map(m => m.usuario_id).filter(Boolean) as string[]
  if (ids.length === 0) return null

  const { data: cfg } = await svc
    .from('configuracoes_sistema')
    .select('valor')
    .eq('empresa_id', empresaId)
    .eq('chave', 'roleta_leads')
    .maybeSingle()

  const ultimo = (cfg?.valor as { ultimo_usuario_id?: string } | null)?.ultimo_usuario_id ?? null
  const idxUltimo = ultimo ? ids.indexOf(ultimo) : -1
  const proximo = ids[(idxUltimo + 1) % ids.length]

  await svc.from('configuracoes_sistema').upsert(
    { empresa_id: empresaId, chave: 'roleta_leads', valor: { ultimo_usuario_id: proximo } },
    { onConflict: 'empresa_id,chave' },
  )

  return proximo
}
