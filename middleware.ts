import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          // Remove maxAge so cookies become session cookies (expire when browser closes)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, { ...options, maxAge: undefined })
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
                      request.nextUrl.pathname.startsWith('/register')

  const isPublicRoute = request.nextUrl.pathname === '/' ||
                        request.nextUrl.pathname.startsWith('/privacy') ||
                        request.nextUrl.pathname.startsWith('/para/') ||
                        request.nextUrl.pathname.startsWith('/entrar') ||
                        request.nextUrl.pathname.startsWith('/register') ||
                        request.nextUrl.pathname.startsWith('/reset-senha') ||
                        request.nextUrl.pathname.startsWith('/api/planos-publicos') ||
                        request.nextUrl.pathname.startsWith('/api/register') ||
                        request.nextUrl.pathname.startsWith('/api/portais/') ||
                        request.nextUrl.pathname.startsWith('/api/imob/') ||
                        request.nextUrl.pathname.startsWith('/imovel/') ||
                        request.nextUrl.pathname.startsWith('/imob/') ||
                        request.nextUrl.pathname.startsWith('/proposta/') ||
                        request.nextUrl.pathname.startsWith('/os/') ||
                        request.nextUrl.pathname.startsWith('/api/os/') ||
                        request.nextUrl.pathname.startsWith('/menu/') ||
                        request.nextUrl.pathname.startsWith('/api/menu/') ||
                        request.nextUrl.pathname.startsWith('/api/veiculos/') ||
                        request.nextUrl.pathname.startsWith('/agendar/') ||
                        request.nextUrl.pathname.startsWith('/api/agendar/') ||
                        request.nextUrl.pathname.startsWith('/orcamento/') ||
                        request.nextUrl.pathname.startsWith('/api/orcamento/') ||
                        request.nextUrl.pathname.startsWith('/offline') ||
                        request.nextUrl.pathname === '/sw.js' ||
                        request.nextUrl.pathname === '/manifest.webmanifest'

  if (!user && !isAuthRoute && !isPublicRoute) {
    if (request.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Logado em /login → roteador. /register fica acessível para logado (usuário
  // sem empresa precisa criar uma — senão vira loop /entrar ↔ /register).
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/entrar', request.url))
  }

  // Guarda de /superadmin: além da checagem no layout (defesa em profundidade),
  // bloqueia o acesso à rota já no middleware para quem não é super admin.
  if (user && request.nextUrl.pathname.startsWith('/superadmin')) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('is_super_admin')
      .eq('id', user.id)
      .single()

    if (!usuario?.is_super_admin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}


// Forçar Node.js runtime no middleware — o Supabase não suporta Edge Runtime
export const runtime = 'nodejs'
