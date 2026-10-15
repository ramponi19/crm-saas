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
 *   POST /api/zapintel/preview  (form: empresa=<id>)  → liga o preview
 *   POST /api/zapintel/preview  (form: clear=1)       → sai do preview
 *
 * POST desde 15/10/2026. Era GET, e GET que muda estado é CSRF: um link em
 * qualquer site (ou numa mensagem) trocava, sem o superadmin perceber, a
 * empresa que ele estava vendo — e a faixa avisa que ações ali "afetam a
 * empresa real". O cookie `lax` não protege: navegação de topo leva o cookie.
 * Agora só formulário da própria origem muda o preview; GET só redireciona.
 *
 * Veio de /api/tracker/preview, que atendia os dois complementos e foi removida
 * com o Tracker (13/08/2026). Só o destino deixou de ser variável.
 */
const COOKIE = 'nexus_preview_empresa'

/** GET não muda nada: link antigo ou de fora cai na gestão de empresas. */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL('/superadmin/empresas', req.url), { status: 303 })
}

/** O pedido veio de uma página deste mesmo site? (Origin, ou Sec-Fetch-Site.) */
function mesmaOrigem(req: Request): boolean {
  const origem = req.headers.get('origin')
  if (origem) {
    try { return new URL(origem).host === new URL(req.url).host } catch { return false }
  }
  return req.headers.get('sec-fetch-site') === 'same-origin'
}

export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return new NextResponse('origem recusada', { status: 403 })
  const form = await req.formData().catch(() => null)
  const clear = form?.get('clear') === '1'

  // Só super admin pode prever empresas alheias.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url), { status: 303 })
  const { data: usuario } = await supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single()
  if (!usuario?.is_super_admin) return NextResponse.redirect(new URL('/dashboard', req.url), { status: 303 })

  if (clear) {
    // Ao sair do preview, volta para a gestão de empresas (de onde o super admin veio).
    const res = NextResponse.redirect(new URL('/superadmin/empresas', req.url), { status: 303 })
    res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 })
    return res
  }

  const empresaId = Number(form?.get('empresa'))
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) {
    return NextResponse.redirect(new URL('/superadmin/empresas', req.url), { status: 303 })
  }
  // Empresa que não existe não vira preview (o layout cairia num estado vazio).
  const { data: existe } = await supabase.from('empresas').select('id').eq('id', empresaId).maybeSingle()
  if (!existe) return NextResponse.redirect(new URL('/superadmin/empresas', req.url), { status: 303 })

  // 303: o navegador segue com GET para /zapintel em vez de repetir o POST.
  const res = NextResponse.redirect(new URL('/zapintel', req.url), { status: 303 })
  // Sessão do navegador; expira em 2h como salvaguarda para não "grudar" o preview.
  res.cookies.set(COOKIE, String(empresaId), {
    path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 2,
  })
  return res
}
