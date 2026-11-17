import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { origemDaRequisicao, registrarAceite, versoesVigentes } from '@/lib/termos'

/**
 * Aceite dos termos de uso e da política de privacidade pela tela /aceite (lib/termos.ts).
 * Grava com a sessão de quem aceita (a RLS de termos_aceites só deixa gravar o próprio).
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!versoesVigentes()) return NextResponse.json({ ok: true, semVersao: true })
  const { data: empresaId } = await supabase.rpc('get_empresa_id')
  const { error } = await registrarAceite(supabase, { usuarioId: user.id, empresaId: (empresaId as number | null) ?? null, ...origemDaRequisicao(req) })
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
