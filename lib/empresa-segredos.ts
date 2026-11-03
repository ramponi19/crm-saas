import { createServiceClient } from '@/lib/supabase/service'
import { encryptCredenciais, decryptCredenciais } from '@/lib/payments/crypto'

type Svc = ReturnType<typeof createServiceClient>

/**
 * SEGREDOS POR EMPRESA (23/10/2026) — `empresa_segredos`, sempre cifrados.
 *
 * A cifra é a das credenciais de pagamento (AES-256-GCM, `PAYMENT_ENCRYPTION_KEY`, que
 * nunca toca o banco): no banco só existe o texto cifrado, e a tabela tem RLS sem
 * política — só a service_role (servidor) lê. O valor em claro só existe aqui, no
 * servidor, e nunca vai para log.
 *
 * Não confundir com lib/segredos.ts (`semSegredos`), que só esconde campos secretos
 * de uma config antes de ela ir para o navegador.
 *
 * Primeiro uso: o token de portal e do site (lib/portal-token.ts).
 */
export async function lerSegredo(svc: Svc, empresaId: number, chave: string): Promise<string | null> {
  const { data } = await svc.from('empresa_segredos').select('valor_cifrado')
    .eq('empresa_id', empresaId).eq('chave', chave).maybeSingle()
  if (!data?.valor_cifrado) return null
  return decryptCredenciais(data.valor_cifrado).valor ?? null
}

/** Grava (ou troca) o segredo. Devolve o erro sem o valor — quem chama decide o que dizer. */
export async function gravarSegredo(svc: Svc, empresaId: number, chave: string, valor: string): Promise<{ error: string | null }> {
  const { error } = await svc.from('empresa_segredos').upsert(
    { empresa_id: empresaId, chave, valor_cifrado: encryptCredenciais({ valor }), atualizado_em: new Date().toISOString() },
    { onConflict: 'empresa_id,chave' },
  )
  return { error: error ? error.message : null }
}
