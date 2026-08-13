import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Preview de super admin para o complemento ZapIntel.
 *
 * Deixa o super admin INSPECIONAR o módulo de QUALQUER empresa — mesmo com o
 * add-on desligado — sem impersonar o CRM inteiro. Grava só um cookie próprio
 * (nexus_preview_empresa) que o layout de /zapintel honra apenas quando o
 * usuário é super admin. Nada disso toca no schema/estado do CRM.
 *
 *   GET /api/zapintel/preview?empresa=<id>  → liga o preview
 *   GET /api/zapintel/preview?clear=1       → sai do preview
 *
 * Veio de /api/tracker/preview, que atendia os dois complementos e foi removida
 * com o Tracker (13/08/2026). Só o destino deixou de ser variável.
 */
const COOKIE = 'nexus_preview_empresa'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clear = url.searchParams.get('clear') === '1'

  // Só super admin pode prever empresas alheias.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))
  const { data: usuario } = await supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single()
  if (!usuario?.is_super_admin) return NextResponse.redirect(new URL('/dashboard', req.url))

  if (clear) {
    // Ao sair do preview, volta para a gestão de empresas (de onde o super admin veio).
    const res = NextResponse.redirect(new URL('/superadmin/empresas', req.url))
    res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 })
    return res
  }

  const empresaId = Number(url.searchParams.get('empresa'))
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    return NextResponse.redirect(new URL('/superadmin/empresas', req.url))
  }

  const res = NextResponse.redirect(new URL('/zapintel', req.url))
  // Sessão do navegador; expira em 2h como salvaguarda para não "grudar" o preview.
  res.cookies.set(COOKIE, String(empresaId), {
    path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 2,
  })
  return res
}
