import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * LOJAS QUE A PESSOA ENXERGA + LOJA PRINCIPAL (5a, 26/11/2026; migração 20261126001000).
 *
 * Grava pela função `usuario_lojas_salvar` na SESSÃO de quem salva (não pela chave de serviço): a função confere
 * dono/superadmin (admin só para quem não é dono), recusa loja que quem salva não enxerga e audita antes → depois.
 * `lojas` vazio = só a principal (a regra antiga); para quem vê a rede a lista não tem efeito.
 */
const ERROS: Record<string, number> = {
  SEM_PERMISSAO: 403, LOJA_NAO_VISIVEL: 403, SOMENTE_LEITURA: 403, SEM_EMPRESA: 400,
  USUARIO_NAO_ENCONTRADO: 404, LOJA_INVALIDA: 400, PRINCIPAL_FORA_DA_LISTA: 400,
}

export async function PATCH(req: NextRequest) {
  const corpo = await req.json().catch(() => null) as { id?: unknown; lojas?: unknown; principal?: unknown } | null
  const id = typeof corpo?.id === 'string' ? corpo.id : ''
  const lojas = Array.isArray(corpo?.lojas) ? corpo.lojas.map(Number) : null
  const principal = corpo?.principal == null || corpo.principal === '' ? null : Number(corpo.principal)
  if (!id || !lojas || lojas.some((n) => !Number.isInteger(n) || n <= 0) || (principal != null && !Number.isInteger(principal))) {
    return NextResponse.json({ error: 'Informe a pessoa, as lojas e a loja principal' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data, error } = await (supabase as unknown as SupabaseClient).rpc('usuario_lojas_salvar', {
    p_usuario: id, p_lojas: lojas, p_principal: principal,
  })
  if (error) {
    const codigo = (error.message.match(/^([A-Z_]+):/) ?? [])[1] ?? ''
    const status = ERROS[codigo]
    if (!status) return NextResponse.json({ error: 'Erro ao salvar as lojas' }, { status: 500 })
    return NextResponse.json({ error: error.message.replace(/^[A-Z_]+:\s*/, ''), codigo }, { status })
  }
  return NextResponse.json({ ok: true, ...(data as object) })
}
