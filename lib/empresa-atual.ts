'use client'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Empresa da sessão, resolvida do MESMO jeito que o servidor resolve.
 *
 * O jeito errado, espalhado pelo cliente, era consultar `empresa_usuarios` do
 * usuário logado. Isso quebra para o super admin operando uma empresa em
 * impersonação: ele NÃO tem vínculo, a consulta volta vazia (406 no `.single()`)
 * e a ação morre com "Empresa não encontrada" — depois de o formulário inteiro
 * estar preenchido. Foi o que travou o fechamento de uma venda no PDV.
 *
 * `get_empresa_id()` é a função que o servidor já usa e que toda política de RLS
 * consulta: devolve a empresa impersonada enquanto o TTL vale, senão o vínculo
 * ativo. Usar a mesma fonte aqui mantém cliente, servidor e RLS de acordo.
 */
export async function empresaAtualId(supabase: SupabaseClient): Promise<number | null> {
  const { data, error } = await supabase.rpc('get_empresa_id')
  if (error) return null
  const id = Number(data)
  return Number.isFinite(id) && id > 0 ? id : null
}
