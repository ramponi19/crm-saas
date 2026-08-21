import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { moduloDaRota } from '@/lib/menu'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

/**
 * Cache dos módulos habilitados por empresa (trava de rota por segmento).
 *
 * `segmentos_config` muda uma vez a cada muito tempo, e sem cache isso viraria
 * duas consultas a cada navegação. TTL curto porque o superadmin ligar um módulo
 * e o menu demorar 1 minuto para valer é aceitável; o contrário (consulta a cada
 * clique) não é.
 */
const TTL_MODULOS_MS = 60_000
const cacheModulos = new Map<number, { habilitados: Set<string>; expira: number }>()

/**
 * Telas de parametrização que saíram do CRM e passaram a viver em /admin
 * (o antigo grupo "Sistema" da sidebar). Mantemos o redirect para não quebrar
 * links salvos, retorno do Stripe e URLs antigas.
 */
const LEGADO_ADMIN = [
  '/canais', '/modelos', '/funil', '/cadencias', '/distribuicao', '/scoring',
  '/meu-menu', '/permissoes', '/aparencia', '/configuracoes', '/empresa', '/planos',
  /**
   * Saíram do menu do CRM em 21/08/2026 e passaram a viver só no /admin: são
   * leitura e definição de GESTÃO, não ferramenta de quem atende. Ficam na lista
   * para que link salvo, favorito e atalho antigo caiam no painel em vez de abrir
   * a mesma tela por uma porta que não existe mais no menu.
   */
  '/equipe', '/conversao', '/metas',
]

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
                        request.nextUrl.pathname === '/track.js' ||
                        request.nextUrl.pathname.startsWith('/i/') ||
                        request.nextUrl.pathname.startsWith('/api/rastreamento/') ||
                        request.nextUrl.pathname === '/manifest.webmanifest'

  if (!user && !isAuthRoute && !isPublicRoute) {
    if (request.nextUrl.pathname.startsWith('/api')) {
      // A mensagem chega como toast na tela. "Unauthorized" fazia sessão expirada
      // parecer falta de PERMISSÃO — o dono da empresa clicava em criar usuário,
      // via "Unauthorized" e concluía que o próprio CRM o estava limitando. Aqui
      // não há juízo de permissão nenhum: só não há mais sessão.
      return NextResponse.json(
        { error: 'Sua sessão expirou. Entre novamente para continuar.', code: 'sessao_expirada' },
        { status: 401 },
      )
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Logado em /login → roteador. /register fica acessível para logado (usuário
  // sem empresa precisa criar uma — senão vira loop /entrar ↔ /register).
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/entrar', request.url))
  }

  // Rotas antigas do grupo "Sistema" → /admin/... (preserva a query string).
  if (user) {
    const p = request.nextUrl.pathname
    const legado = LEGADO_ADMIN.find((h) => p === h || p.startsWith(h + '/'))
    if (legado) {
      const url = request.nextUrl.clone()
      url.pathname = `/admin${p}`
      return NextResponse.redirect(url)
    }
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

  // Trava de rota por SEGMENTO. Até aqui o opt-in de módulo era só de menu: o
  // link sumia, mas quem tinha a tela nos favoritos continuava usando — o dono
  // desligava o módulo e ele seguia funcionando. Papel e plano já travam nas
  // próprias páginas (requireEmpresaRole / exigirPlano); esta trava cuida só da
  // camada que não tinha nenhuma.
  /**
   * Telas que VIRARAM outra coisa (não foram para /admin).
   *
   * Proprietário passou a ser papel de cliente (21/08/2026), então a tela dele
   * deixou de existir. Link salvo cai em Clientes em vez de bater num 404.
   */
  if (user) {
    const FUNDIDAS: Record<string, string> = { '/proprietarios': '/clientes' }
    const destino = FUNDIDAS[request.nextUrl.pathname]
    if (destino) return NextResponse.redirect(new URL(destino, request.url))
  }

  const modulo = user ? moduloDaRota(request.nextUrl.pathname) : null
  if (modulo) {
    // SUPERADMIN PASSA. Ele constrói módulo novo antes de existir liberação, e a
    // trava olha o segmento da empresa (inclusive a de preview, quando ele está
    // impersonando): sem esta saída, o laboratório barraria justamente quem está
    // fazendo a página.
    const { data: eu } = await supabase.from('usuarios').select('is_super_admin').eq('id', user!.id).maybeSingle()
    if (eu?.is_super_admin) return supabaseResponse

    const habilitados = await modulosHabilitados(supabase)
    // habilitados === null => não deu para saber. Passa direto: derrubar o CRM
    // inteiro por uma consulta que falhou é muito pior do que uma tela a mais.
    if (habilitados && !habilitados.has(modulo)) {
      const url = new URL('/dashboard', request.url)
      url.searchParams.set('indisponivel', modulo)
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

/** Módulos habilitados da empresa ativa (respeita impersonação via RPC). */
async function modulosHabilitados(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Set<string> | null> {
  try {
    const { data: empresaId } = await supabase.rpc('get_empresa_id')
    if (!empresaId) return null

    const cached = cacheModulos.get(empresaId as number)
    if (cached && cached.expira > Date.now()) return cached.habilitados

    const { data: empresa } = await supabase
      .from('empresas').select('segmento').eq('id', empresaId).single()
    const { data: seg } = await supabase
      .from('segmentos_config').select('modulos_habilitados')
      .eq('chave', empresa?.segmento ?? 'varejo').eq('ativo', true).maybeSingle()

    // Segmento sem lista configurada não é motivo para bloquear nada.
    const lista = seg?.modulos_habilitados as string[] | null | undefined
    if (!Array.isArray(lista) || lista.length === 0) return null

    const habilitados = new Set(lista)
    cacheModulos.set(empresaId as number, { habilitados, expira: Date.now() + TTL_MODULOS_MS })
    return habilitados
  } catch {
    return null
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}


// Forçar Node.js runtime no middleware — o Supabase não suporta Edge Runtime
export const runtime = 'nodejs'
