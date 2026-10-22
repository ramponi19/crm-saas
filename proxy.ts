import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { moduloDaRota, hrefsLigados } from '@/lib/menu'
import { segOverrideDoPreset, camadasDoMenu, instaladosDoManifesto, type PresetRow, type ModuloRow } from '@/lib/empresa-config'
import { temVitrine } from '@/lib/modulos-vitrine'
import { COOKIE_VERSAO_MODULOS } from '@/core/modulos'

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
// A chave leva a versão do cookie COOKIE_VERSAO_MODULOS (core/modulos.ts): quem
// instalou ou desinstalou na Central vê a rota certa na hora; os outros, no minuto.
const cacheModulos = new Map<string, { habilitados: Set<string>; expira: number }>()

/**
 * Endereços do CRM de ANTES do /admin (o antigo grupo "Sistema" da sidebar, até
 * 21/08/2026) → onde a tela mora hoje. Desde a navegação nova (21/10/2026) o
 * /admin também saiu: Configurações (/configuracoes/*), Insights e Automações no
 * menu. O destino é o final, sem passar pelo /admin (que só tem 308, no
 * next.config.ts). Cadências, Distribuição, Scoring, Modelos, Conversão e Metas
 * voltaram a ser rotas do CRM e saíram daqui.
 *
 * ⚠ `/canais` é o `redirect_uri` registrado no app da Meta: a query (`?code=`)
 * tem de passar — e passa, porque só o caminho é trocado.
 */
const LEGADO_ADMIN: Record<string, string> = {
  '/canais': '/configuracoes/integracoes',
  '/funil': '/configuracoes/funil',
  '/meu-menu': '/configuracoes/menu',
  '/permissoes': '/configuracoes/permissoes',
  '/aparencia': '/configuracoes/aparencia',
  '/empresa': '/configuracoes/empresa',
  '/planos': '/configuracoes/faturamento',
  '/equipe': '/configuracoes/usuarios',
}

/**
 * ROTAS QUE NÃO PRECISAM DE SESSÃO — E QUE POR ISSO NEM ABREM O SUPABASE.
 *
 * ══ POR QUE ISTO EXISTE (09/10/2026) ═══════════════════════════════════════
 *
 * No Next 16 este arquivo roda SEMPRE em Node (ver o rodapé), e na Vercel isso
 * significa que ele é cobrado como **Active CPU**, em toda requisição que o
 * matcher pega. Medido no painel da conta: `Edge Middleware Invocations: 0` e
 * **middleware = 1h 04m dos 2h 26m que o CRM gastou em 30 dias** — 44% do CPU
 * do projeto, 27% do teto de 4 h/mês que o plano free dá para TODOS os
 * projetos juntos. Estourar o teto não cobra a mais: **pausa os projetos**.
 *
 * São 51 ms de CPU por requisição, quase todos em `supabase.auth.getUser()`.
 * E a ordem do código fazia esse custo ser pago INCLUSIVE onde ele era
 * descartado: o `getUser()` vinha antes, e só depois se perguntava se a rota
 * era pública. Webhook da Meta, disparo de cron, pixel de rastreamento — todos
 * pagavam uma verificação de sessão cujo resultado ia para o lixo.
 *
 * ══ POR QUE ISTO NÃO AFROUXA NADA ══════════════════════════════════════════
 *
 * Esta lista é um SUBCONJUNTO de `isPublicRoute`, logo abaixo. Toda rota aqui
 * já passava direto; a única diferença é que agora passa sem pagar a consulta.
 * Nenhuma rota autenticada entra aqui — e nenhuma deve entrar sem que alguém
 * confira esse subconjunto de novo.
 *
 * Só `/api/*`, de propósito: `moduloDaRota()` olha o primeiro segmento do
 * caminho contra os hrefs do menu, que são todos telas. Rota de API nunca cai
 * na trava de módulo, então sair cedo aqui não escapa de trava nenhuma. Tela
 * pública (`/imovel/`, `/proposta/`, `/orcamento/`) fica fora desta lista
 * justamente por isso.
 */
const SEM_SESSAO = [
  // Monitor de uptime (21/10/2026): também fora do matcher, abaixo.
  '/api/saude',
  '/api/webhook/',
  '/api/cron/',
  '/api/rastreamento/',
  '/api/portais/',
  '/api/planos-publicos',
  '/api/os/',
  '/api/menu/',
  '/api/veiculos/',
  '/api/agendar/',
  '/api/orcamento/',
  '/api/imob/',
]

export async function proxy(request: NextRequest) {
  // Antes de qualquer coisa: a rota precisa mesmo de sessão? Ver SEM_SESSAO.
  if (SEM_SESSAO.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next()
  }

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
                        // Webhook do Contact2Sale: parceiro nao tem sessao, e a
                        // autenticacao e o token secreto na propria URL — mesmo
                        // desenho do webhook dos portais.
                        request.nextUrl.pathname.startsWith('/api/webhook/') ||
                        /**
                         * ⚠️ OS CRONS NUNCA RODARAM. Descoberto em 01/09/2026.
                         *
                         * Quem chama e o agendador da Vercel, que nao tem sessao —
                         * entao o middleware devolvia 401 antes de a rota existir, e
                         * a Vercel marcava o disparo como bem-sucedido. Falha
                         * perfeitamente silenciosa: cinco jobs agendados, zero
                         * execucoes, nenhum erro em lugar nenhum.
                         *
                         * A prova estava no dado: a Imobiliaria com trial vencido ha
                         * 47 dias e ainda `ativo` (o `expirar-trials` teria suspendido
                         * em 17/07), e `followups_gerados` vazia desde sempre.
                         *
                         * A autenticacao existe e e outra: `verificarCronSecret`
                         * compara o Bearer com `CRON_SECRET` em tempo constante e
                         * FALHA FECHADO se a variavel nao estiver configurada. Mesmo
                         * desenho do webhook dos portais, logo acima.
                         */
                        request.nextUrl.pathname.startsWith('/api/cron/') ||
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
    /**
     * O retorno do login do Instagram e uma NAVEGACAO, nao uma chamada de tela.
     *
     * Ele e uma rota de API por desenho — o codigo da Meta nao pode passear pela
     * URL de uma pagina, foi assim que o conector via Pagina quebrou hoje. Mas quem
     * chega nela e o navegador do lojista voltando do instagram.com. Se a sessao
     * tiver expirado nesse meio, responder JSON deixa a pessoa olhando
     * `{"error":...}` na tela, sem nem saber que perdeu a sessao. Manda para o
     * login, que e o que ela precisa fazer.
     */
    if (request.nextUrl.pathname === '/api/canais/instagram/retorno') {
      // Sem parametro de retorno: a tela de login nao le nenhum, e inventar um
      // seria prometer na URL algo que o sistema nao faz. Depois de entrar, o
      // lojista volta em Integracoes e clica de novo — o codigo da Meta expira em
      // minutos de qualquer forma, entao nao havia o que salvar.
      return NextResponse.redirect(new URL('/login', request.url))
    }
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

  // Rotas antigas do grupo "Sistema" → onde moram hoje (preserva a query string).
  if (user) {
    const p = request.nextUrl.pathname
    const legado = Object.keys(LEGADO_ADMIN).find((h) => p === h || p.startsWith(h + '/'))
    if (legado) {
      const url = request.nextUrl.clone()
      url.pathname = LEGADO_ADMIN[legado] + p.slice(legado.length)
      // 308: a mudança é definitiva — o navegador pode lembrar do endereço novo.
      return NextResponse.redirect(url, 308)
    }
  }

  // Guarda de /superadmin: além da checagem no layout (defesa em profundidade),
  // bloqueia o acesso à rota já no proxy para quem não é super admin.
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
    const FUNDIDAS: Record<string, string> = {
      '/proprietarios': '/clientes',
      // A chave virou atributo do imóvel (21/08/2026): estado na lista, filtro nos
      // chips e empréstimo dentro da ficha.
      '/chaves': '/imoveis',
    }
    const destino = FUNDIDAS[request.nextUrl.pathname]
    if (destino) return NextResponse.redirect(new URL(destino, request.url))
  }

  const modulo = user ? moduloDaRota(request.nextUrl.pathname) : null
  if (modulo) {
    // SUPERADMIN PASSA. Ele constrói módulo novo antes de existir liberação, e a
    // trava olha o segmento da empresa (inclusive a de preview, quando ele está
    // impersonando): sem esta saída, o laboratório barraria justamente quem está
    // fazendo a página.
    //
    // EXCETO nos módulos com vitrine (etapa 0): ali o superadmin vê o mesmo que o
    // dono, e é da vitrine que ele liga o módulo. São módulos prontos, não
    // construção — o motivo da passagem livre não se aplica a eles.
    const vitrine = temVitrine(modulo)
    const { data: eu } = await supabase.from('usuarios').select('is_super_admin').eq('id', user!.id).maybeSingle()
    if (eu?.is_super_admin && !vitrine) return supabaseResponse

    const habilitados = await modulosHabilitados(supabase, request.cookies.get(COOKIE_VERSAO_MODULOS)?.value ?? '')
    // habilitados === null => não deu para saber. Passa direto: derrubar o CRM
    // inteiro por uma consulta que falhou é muito pior do que uma tela a mais.
    if (habilitados && !habilitados.has(modulo)) {
      /**
       * MÓDULO DESLIGADO = VITRINE, NÃO REDIRECT (etapa 0). Agenda, Executivo e
       * Gestão de Leads mostram o que fazem e o botão de ativar, no mesmo
       * endereço. Os demais módulos seguem caindo no dashboard com o aviso.
       */
      if (vitrine) {
        const destino = NextResponse.rewrite(new URL(`/vitrine${modulo}`, request.url))
        supabaseResponse.cookies.getAll().forEach((c) => destino.cookies.set(c))
        return destino
      }
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
  versao: string,
): Promise<Set<string> | null> {
  try {
    const { data: empresaId } = await supabase.rpc('get_empresa_id')
    if (!empresaId) return null

    const chave = `${empresaId}:${versao}`
    const cached = cacheModulos.get(chave)
    if (cached && cached.expira > Date.now()) return cached.habilitados

    // A lista do segmento mora no preset (presets_onboarding.rotulos._menu) desde
    // 21/10/2026 — ver lib/empresa-config.ts. Mesma lista, mesma regra.
    const { data: empresa } = await supabase
      .from('empresas').select('preset_onboarding').eq('id', empresaId).single()
    const { data: preset } = await supabase
      .from('presets_onboarding').select('chave, rotulos')
      .eq('chave', empresa?.preset_onboarding ?? 'varejo').eq('ativo', true).maybeSingle()

    // Segmento sem lista configurada não é motivo para bloquear nada.
    const lista = segOverrideDoPreset(preset as PresetRow | null)?.habilitados
    if (!Array.isArray(lista) || lista.length === 0) return null

    /**
     * + o que o superadmin ligou SÓ PARA ESTA EMPRESA (empresa_menu.itens.superadmin
     * .habilitados) — a mesma camada 3 do menu. Sem isto, o módulo ligado por
     * empresa aparecia no menu e a trava barrava a rota (etapa 0, achado ao fazer
     * o "Ativar" da vitrine).
     */
    const [{ data: menu }, { data: modulos }] = await Promise.all([
      supabase.from('empresa_menu').select('itens').eq('empresa_id', empresaId).maybeSingle(),
      // + a Central de Módulos: instalado entra, desinstalado sai (a mesma camada do menu).
      supabase.from('empresa_modulos').select('modulo, ativo, config').eq('empresa_id', empresaId),
    ])
    const porEmpresa = camadasDoMenu(menu?.itens).superadmin?.habilitados ?? []
    const habilitados = hrefsLigados([...lista, ...porEmpresa], instaladosDoManifesto(modulos as ModuloRow[] | null))
    if (cacheModulos.size > 500) cacheModulos.clear() // uma chave por versão: não deixa crescer sem fim
    cacheModulos.set(chave, { habilitados, expira: Date.now() + TTL_MODULOS_MS })
    return habilitados
  } catch {
    return null
  }
}

/**
 * O MATCHER: QUEM NEM CHEGA A ACORDAR ESTE ARQUIVO.
 *
 * ══ A DIFERENÇA ENTRE ESTA LISTA E `SEM_SESSAO` ════════════════════════════
 *
 * `SEM_SESSAO` corta a consulta de sessão — mas o proxy já ACORDOU, e na
 * Vercel acordar já é Active CPU cobrado. O matcher corta antes: a requisição
 * nem passa por aqui. É a diferença entre pagar barato e não pagar.
 *
 * Medido em 09/10/2026: o middleware era 1h04m dos 2h26m do projeto — 27% do
 * teto de 4 h/mês que o plano free dá para TODOS os projetos juntos. Estourar
 * o teto não cobra a mais: PAUSA os projetos.
 *
 * ══ O CRITÉRIO PARA ENTRAR AQUI ════════════════════════════════════════════
 *
 * Só entra caminho em que o proxy PROVADAMENTE não faz nada: ou está em
 * `SEM_SESSAO` (sai no primeiro `if`), ou está em `isPublicRoute` e é arquivo
 * servido igual para todo mundo. Nenhuma rota autenticada entra aqui — e
 * nenhuma deve entrar sem que alguém releia os dois conjuntos.
 *
 * As quatro de `/api/` continuam em `SEM_SESSAO` de propósito: lista e regex
 * podem divergir com o tempo, e a redundância custa um `startsWith`.
 *
 * ══ `/monitoring` NÃO É ECONOMIA, É CONSERTO ═══════════════════════════════
 *
 * É o túnel do Sentry (`tunnelRoute` em `next.config.ts`), por onde o
 * navegador manda o erro. Ele NÃO estava em `isPublicRoute`: erro de quem não
 * tinha sessão — exatamente quem está travado na tela de login — levava 401 do
 * proxy e nunca chegava ao Sentry. O relatório que mais importa era o único
 * que se perdia.
 *
 * ══ POR QUE UMA LINHA SÓ, FEIA, SEM QUEBRA ═════════════════════════════════
 *
 * Porque o Next exige: "The `matcher` values need to be constants so they can
 * be statically analyzed at build-time. Dynamic values such as variables will
 * be ignored" (`node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md`). Concatenar com `+` para caber na tela é uma
 * EXPRESSÃO, não uma constante: o matcher seria ignorado, o proxy voltaria a
 * rodar em tudo e nada avisaria. A economia sumiria em silêncio.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|monitoring|api/saude|api/webhook/|api/cron/|api/rastreamento/|api/portais/|i/|offline|sw\\.js|track\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}


// Não há mais `export const runtime`: no Next 16 este arquivo (proxy.ts, o
// antigo middleware.ts) roda SEMPRE em Node.js e não aceita configuração de
// runtime — que é justamente o que o Supabase precisa.
