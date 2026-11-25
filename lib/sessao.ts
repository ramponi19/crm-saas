/**
 * CONTEXTO DA SESSÃO (etapa 1.1b, 25/11/2026; docs/etapa-1.1-plano.md §2).
 *
 * Uma chamada a `sessao_contexto()` (banco) devolve empresa, loja, cargo, permissões, somente leitura e se é a
 * plataforma (superadmin impersonando). Substitui as leituras de `empresa_usuarios` com `.single()` sem filtro de
 * empresa — a causa do 406 do Laboratório (reproduzido no local em 25/11: superadmin com a impersonação vencida).
 * O banco é quem decide (RLS e RPCs conferem `tem_permissao`); aqui o app só lê para esconder e barrar a tela.
 */
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { temPermissao, destinoSemEmpresa, type ContextoSessao, type Permissao } from '@/lib/permissoes-cargo'

export * from '@/lib/permissoes-cargo'

/** O contexto da sessão (null sem login). Uma vez por request. */
export const contextoDaSessao = cache(async (): Promise<ContextoSessao | null> => {
  const supabase = await createClient()
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc('sessao_contexto')
  if (error || !data) return null
  return data as ContextoSessao
})

/** Página: exige a permissão; sem ela, volta ao painel. */
export async function exigirPermissao(p: Permissao): Promise<ContextoSessao> {
  const ctx = await contextoDaSessao()
  if (!ctx) redirect('/login')
  if (!ctx.empresa_id) redirect(destinoSemEmpresa(ctx))
  if (!temPermissao(ctx, p)) redirect('/dashboard')
  return ctx
}

/** Rota: exige a permissão; devolve o contexto ou a resposta 401/403 pronta. */
export async function exigirPermissaoApi(p: Permissao): Promise<{ ctx: ContextoSessao; erro?: never } | { erro: NextResponse; ctx?: never }> {
  const ctx = await contextoDaSessao()
  if (!ctx) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  if (!ctx.empresa_id || !temPermissao(ctx, p)) return { erro: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  return { ctx }
}

