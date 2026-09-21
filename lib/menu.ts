/**
 * Pipeline de resolução do menu (arquitetura da sidebar Precisão).
 *
 * O menu final de um usuário é calculado em CAMADAS, nesta ordem de precedência:
 *   1. SEGMENTO      — base: módulos + labels do segmento (lib/segmentos)
 *   2. PLANO         — módulos que o plano permite (bloqueia com cadeado)
 *   3. OVERRIDE SUPERADMIN — liga/desliga módulo por empresa (Fase 2.B)
 *   4. CONFIG DONO   — oculta/renomeia dentro do que sobrou (Fase 2.B)
 *   5. PAPEL         — adminOnly só para owner/admin/superadmin
 *   6. TEMA          — só visual (wl_menu); tratado na sidebar via CSS vars
 *
 * `resolverMenu` é PURA e testável (sem React, ícone é string). As camadas 3 e 4
 * recebem dados que só existem a partir da Fase 2.B; até lá chegam `undefined`.
 */

import { planoTemAcesso, type ModuloPlano } from './plano'
import { SEGMENTOS, type Segmento } from './segmentos'

export type BadgeKey = 'leads' | 'garantia' | 'chat'

/**
 * Maturidade do módulo — é o que permite liberar o CRM por partes.
 *
 * `construcao` não depende de configuração nenhuma: nenhum lojista vê, mesmo que
 * alguém ligue o módulo no segmento por engano. Sem isso, "liberar por partes"
 * dependeria de alguém lembrar de desligar algo, e uma tela pela metade fica a
 * um clique de um cliente real.
 *
 * `beta` segue as regras normais de liberação, mas com selo na sidebar: o
 * lojista precisa saber que aquela tela ainda está mudando.
 */
export type StatusModulo = 'construcao' | 'beta' | 'producao'

export interface MenuItemBase {
  href: string
  label: string
  /** Nome do ícone lucide (resolvido para componente na sidebar). */
  icon: string
  modulo?: ModuloPlano
  adminOnly?: boolean
  badge?: BadgeKey
  /** Módulo OPCIONAL (nasce desligado; habilitado por segmento via opt-in). */
  opcional?: boolean
  /** Ausente = producao (o normal). */
  status?: StatusModulo
}

export interface MenuGroupBase {
  label: string
  items: MenuItemBase[]
}

export interface MenuItem extends MenuItemBase {
  /** Label final (após overrides de segmento/superadmin/dono). */
  label: string
  /** Bloqueado por plano — renderiza cadeado e leva a /planos. */
  locked: boolean
}

/** Status efetivo: item sem status declarado está em produção. */
export const statusDo = (i: MenuItemBase): StatusModulo => i.status ?? 'producao'

/** Todos os itens do catálogo, achatados — usado pelo laboratório do superadmin. */
export function todosOsItens(): MenuItemBase[] {
  return CATALOGO.flatMap((g) => g.items)
}

export interface MenuGroup {
  label: string
  items: MenuItem[]
}

/** Overrides do superadmin por empresa (camada 3). Preenchido na Fase 2.B. */
export interface MenuOverridesSuperadmin {
  /** força liga/desliga de módulo por chave de plano: { bi: true, ... } */
  modulos?: Partial<Record<ModuloPlano, boolean>>
  /** esconde hrefs específicos */
  hidden?: string[]
  /** renomeia: href -> label */
  labels?: Record<string, string>
  /**
   * LIGA hrefs para ESTA empresa, mesmo que o segmento dela não os habilite.
   *
   * ══ A LACUNA QUE ISTO FECHA ══════════════════════════════════════════════
   *
   * Até aqui, tudo o que era por EMPRESA só sabia desligar (`hidden`,
   * `modulos: false`). Ligar era só por SEGMENTO — e segmento é compartilhado:
   * a JM Store e a Preview · Loja são as duas `varejo`. Liberar um módulo novo
   * "só para a JM" pelo opt-in do segmento o entregaria junto ao tenant de
   * demonstração, e não existia lever para separar os dois.
   *
   * A alternativa seria `if (empresaId === 1)` no código, que envelhece na
   * primeira empresa nova e não é editável por ninguém.
   *
   * Não fura maturidade nem papel: módulo em `construcao` continua só do
   * superadmin, e `adminOnly` continua valendo. Isto é opt-in, não passe livre.
   *
   * ══ HREF FORA DO CATÁLOGO LIBERA SUB-TELA ════════════════════════════════
   *
   * A lista responde "esta empresa tem este href?". A sidebar consome a
   * resposta apenas para os hrefs que existem no CATALOGO — então um href de
   * sub-tela (`/orcamentos/cotacao`) libera a ABA sem criar item de menu
   * nenhum. É o que permite entregar uma tela nova dentro de uma existente para
   * um cliente só, sem um segundo mecanismo de liberação paralelo a este.
   */
  habilitados?: string[]
}

/**
 * A forma da coluna `empresas.menu_override` no banco.
 *
 * Estava escrita à mão como `{ hidden?, labels? }` em QUATRO arquivos (layout do
 * CRM, /entrar, /admin/meu-menu e a rota do superadmin). Acrescentar
 * `habilitados` exigiu achar os quatro — e o que ficasse de fora não daria erro
 * de compilação: só ignoraria a chave nova, silenciosamente.
 *
 * NÃO é o mesmo que `MenuOverridesSuperadmin`: `modulos` mora na coluna vizinha
 * `modulos_override`. Unir os dois tipos convidaria a gravar `modulos` aqui.
 */
export type MenuOverrideRow = Omit<MenuOverridesSuperadmin, 'modulos'>

/**
 * O href que liga a cotação de troca (Upgrade/Downgrade) para uma empresa.
 *
 * Mora aqui, e não em `lib/troca-acesso.ts`, porque componente de CLIENTE
 * precisa dele — e `troca-acesso` importa `lib/supabase/server`, que não pode
 * atravessar a fronteira. `lib/menu.ts` é puro (sem React, sem banco).
 *
 * Não está no CATALOGO de propósito: a cotação é ABA de Orçamentos e MODAL do
 * lead, nunca item de sidebar. Ver `MenuOverridesSuperadmin.habilitados`.
 */
export const HREF_COTACAO_TROCA = '/orcamentos/cotacao'

/**
 * Esta empresa tem este href liberado?
 *
 * Existe para as SUB-TELAS, que não passam pelo `resolverMenu`: a página
 * pergunta direto, e pergunta o mesmo que a sidebar perguntaria. Dois jeitos de
 * responder "a empresa tem o módulo?" divergiriam no primeiro ajuste — e o
 * sintoma seria uma aba visível numa loja que não deveria tê-la.
 */
export function temHrefLiberado(overrides: MenuOverridesSuperadmin | null | undefined, href: string): boolean {
  return (overrides?.habilitados ?? []).includes(href)
}

/** Config do dono dentro da própria empresa (camada 4). Preenchido na Fase 2.B. */
export interface MenuConfigDono {
  hidden?: string[]
  labels?: Record<string, string>
  /**
   * Ordem escolhida pelo DONO, arrastando em /admin/meu-menu.
   *
   * Mesma forma do layout do segmento — grupo -> hrefs, mais `__grupos` com a
   * ordem das caixas. É a última camada, então vence o segmento: quem usa a loja
   * todo dia sabe melhor que o molde da vertical em que ordem trabalha.
   */
  ordem?: Record<string, string[]>
}

/**
 * Chave especial dentro do layout: a ordem dos GRUPOS, não de itens.
 *
 * Vive no mesmo objeto porque salvar ordem de item e de grupo em dois campos
 * separados abriria a porta para os dois discordarem. O prefixo com dois
 * sublinhados evita colisão com um grupo que alguém chame de "grupos".
 */
export const CHAVE_GRUPOS = '__grupos'

/** Config do segmento vinda do banco (segmentos_config) — sobrepõe o SEGMENTOS estático. */
export interface SegOverride {
  hiddenHrefs?: string[]
  labelOverrides?: Record<string, string>
  modulosExtra?: { href: string; label: string; icon: string; grupo?: string }[]
  /** Opt-in: hrefs habilitados neste segmento (novo modelo). Se presente, tem precedência. */
  habilitados?: string[]
  /** Ordem do menu definida pelo superadmin na tela de Segmentos (segmentos_config.menu_layout). */
  menuLayout?: Record<string, string[]>
}

export interface ResolverMenuInput {
  segmento: Segmento
  plano?: string
  role: string
  isSuperAdmin: boolean
  overrides?: MenuOverridesSuperadmin
  configDono?: MenuConfigDono
  /** Camada 1 dinâmica: config do segmento do banco (fallback = SEGMENTOS estático). */
  segOverride?: SegOverride
}

/**
 * Itens que a config do dono NÃO pode ocultar (camada 4).
 *
 * Estava com `/dashboard` dentro: aparecia como "fixo" na tela de Menu do CRM e
 * o dono não conseguia tirar, mesmo em loja onde a tela inicial não serve para
 * nada (quem só atende no balcão vive no PDV e no funil).
 *
 * Hoje vazio de propósito, e é seguro: ocultar é só de MENU — a rota continua
 * acessível, e o dono desfaz em /admin/meu-menu, que fica fora do menu do CRM e
 * portanto não pode ser escondido junto. Não existe como se trancar para fora.
 */
const PROTEGIDOS = new Set<string>()

// Núcleo: sempre habilitado, independente do opt-in do segmento.
const NUCLEO = new Set(['/dashboard', '/leads', '/clientes'])

/** Hrefs do catálogo que NÃO são opcionais (base comum a todo segmento). */
export function hrefsBase(): string[] {
  return CATALOGO.flatMap((g) => g.items).filter((i) => !i.opcional).map((i) => i.href)
}

/**
 * Módulo do catálogo a que uma rota pertence — ou null se a rota não é módulo.
 *
 * Usado pela trava do middleware. Devolver null para o que não conhecemos é
 * proposital: a trava só age sobre rota que está no catálogo, então rota nova,
 * /admin, /api e afins passam direto em vez de dependerem de eu lembrar de
 * incluí-las numa lista de exceções.
 */
export function moduloDaRota(pathname: string): string | null {
  const raiz = '/' + (pathname.split('/')[1] ?? '')
  if (NUCLEO.has(raiz)) return null // núcleo nunca é bloqueado
  return CATALOGO.flatMap((g) => g.items).some((i) => i.href === raiz) ? raiz : null
}

/**
 * Deriva os módulos habilitados a partir da config ESTÁTICA (fallback quando o
 * banco ainda não tem `modulos_habilitados`): base menos ocultos + extras.
 */
function habilitadosDerivados(seg: { hiddenHrefs: string[]; modulosExtra?: { href: string }[] }): string[] {
  const base = hrefsBase().filter((h) => !seg.hiddenHrefs.includes(h))
  const extras = (seg.modulosExtra ?? []).map((m) => m.href)
  return [...base, ...extras]
}

/**
 * Catálogo base do menu (camada 1, parte comum). Os módulos EXCLUSIVOS de cada
 * segmento (modulosExtra) são injetados por resolverMenu no grupo que o segmento
 * declarar (padrão "Operação").
 *
 * ATÉ 19/08/2026 ESTE COMENTÁRIO MENTIA: resolverMenu percorria só o CATALOGO e
 * jamais injetava extra nenhum. Os extras da imobiliária apareciam por coincidência
 * — /imoveis, /proprietarios e /chaves também estão aqui como opcionais. Quem
 * descobriu foi o ranking, que precisa existir no menu de UM segmento sem voltar
 * para o menu da JM, de onde saiu a pedido do dono.
 * Itens de Fase 4 (Propostas em Comercial, Metas em Gestão) entram depois — os
 * grupos já ficam prontos.
 */
export const CATALOGO: MenuGroupBase[] = [
  {
    label: 'Hoje',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
      { href: '/tarefas', label: 'Tarefas', icon: 'CheckSquare' },
      { href: '/agenda', label: 'Agenda', icon: 'Calendar', opcional: true },
      { href: '/chat', label: 'Chat', icon: 'MessageSquare', opcional: true, badge: 'chat' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/leads', label: 'Leads', icon: 'Target', badge: 'leads' },
      { href: '/clientes', label: 'Clientes', icon: 'Users' },
      { href: '/fila', label: 'Fila do dia', icon: 'ListChecks' },
      { href: '/marketing', label: 'Marketing', icon: 'Megaphone' },
      // Cobranca do que parou: opcional porque nasce ligado so onde o dono pediu.
      { href: '/gestao-leads', label: 'Gestão de Leads', icon: 'CircleAlert', opcional: true },
      { href: '/orcamentos', label: 'Orçamentos', icon: 'Receipt' },
      { href: '/propostas', label: 'Propostas', icon: 'FileText', adminOnly: true },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/pdv', label: 'PDV', icon: 'ScanBarcode' },
      { href: '/historico', label: 'Histórico', icon: 'ReceiptText' },
      { href: '/simular-parcela', label: 'Simular parcela', icon: 'Calculator' },
      { href: '/estoque', label: 'Estoque', icon: 'Boxes' },
      // Só faz sentido onde se vende aparelho — opcional, como a FIPE em veículos.
      { href: '/check-imei', label: 'Check IMEI', icon: 'ScanSearch', opcional: true },
      { href: '/catalogo', label: 'Produtos', icon: 'Smartphone' },
      { href: '/compras', label: 'Compras', icon: 'ShoppingCart' },
      { href: '/garantia', label: 'Garantia', icon: 'ShieldCheck', badge: 'garantia' },
      { href: '/assistencia', label: 'Assistência', icon: 'Wrench' },
      // Ferramenta compartilhada (imob + veículos) — opcional, junto do simulador.
      { href: '/simular-financiamento', label: 'Financiamento', icon: 'Calculator', opcional: true },
    ],
  },
  {
    label: 'Imóveis',
    items: [
      { href: '/imoveis', label: 'Imóveis', icon: 'Home', opcional: true },
    ],
  },
  {
    label: 'Veículos',
    items: [
      { href: '/avaliacoes', label: 'Avaliações', icon: 'ClipboardCheck', opcional: true },
      { href: '/consulta-fipe', label: 'Consulta FIPE', icon: 'Car', opcional: true },
    ],
  },
  {
    label: 'Food',
    items: [
      { href: '/cardapio', label: 'Cardápio', icon: 'UtensilsCrossed', opcional: true },
      { href: '/kds', label: 'Cozinha (KDS)', icon: 'CookingPot', opcional: true },
    ],
  },
  {
    label: 'Gestão',
    items: [
      // Painel do dono da vertical: opcional (fora de hrefsBase), então nenhum
      // segmento herda por acidente — só quem tem '/executivo' na lista habilitada.
      { href: '/executivo', label: 'Executivo', icon: 'Landmark', opcional: true, adminOnly: true },
      { href: '/relatorios', label: 'Relatórios', icon: 'BarChart3', modulo: 'bi', adminOnly: true },
      { href: '/financeiro', label: 'Financeiro', icon: 'Wallet', adminOnly: true },
      /**
       * Equipe, Conversão e Meta da empresa SAÍRAM daqui (21/08/2026).
       *
       * Eram três itens de menu para telas que só o dono abre, e uma delas nem era
       * ferramenta: conversão é leitura. Vivem no /admin, onde já estavam Equipe,
       * Relatórios e Financeiro — e o middleware redireciona as rotas antigas.
       */
    ],
  },
  // O antigo grupo "Sistema" (canais, funil, cadências, permissões, aparência,
  // configurações, empresa, planos…) saiu do CRM: é parametrização do DONO e
  // vive em /admin (app/admin/*), fora do menu operacional do funcionário.
]

export function resolverMenu(input: ResolverMenuInput): MenuGroup[] {
  const { segmento, plano, role, isSuperAdmin, overrides, configDono, segOverride } = input
  const seg = SEGMENTOS[segmento]
  const isAdmin = isSuperAdmin || role === 'owner' || role === 'admin'

  // Camada 1 (opt-in): módulos habilitados do segmento — do banco (segOverride)
  // com fallback derivado da config estática. O núcleo sempre entra.
  const habilitados = new Set<string>(segOverride?.habilitados ?? habilitadosDerivados(seg))
  NUCLEO.forEach((h) => habilitados.add(h))
  // Camada 3 (positiva): o superadmin liga um módulo para ESTA empresa, sem
  // passar pelo segmento — que é compartilhado entre tenants. Ver
  // `MenuOverridesSuperadmin.habilitados`.
  ;(overrides?.habilitados ?? []).forEach((h) => habilitados.add(h))

  const segLabels = segOverride?.labelOverrides ?? seg.labelOverrides

  // Camadas 3 (superadmin) + 4 (dono): ocultar dentro do habilitado + renomear.
  const donoHidden = (configDono?.hidden ?? []).filter((h) => !PROTEGIDOS.has(h))
  const hidden = new Set<string>([...(overrides?.hidden ?? []), ...donoHidden])
  const labels: Record<string, string> = {
    ...segLabels,
    ...(overrides?.labels ?? {}),
    ...(configDono?.labels ?? {}),
  }

  const out: MenuGroup[] = []
  for (const g of CATALOGO) {
    const items: MenuItem[] = []
    for (const item of g.items) {
      // Camada 0 — MATURIDADE, antes de qualquer configuração: módulo em
      // construção é só do superadmin. Fica ANTES do opt-in de propósito: se
      // alguém ligar o módulo no segmento por engano, o lojista continua sem
      // ver. É o que sustenta liberar o CRM por partes sem depender de memória.
      if (statusDo(item) === 'construcao' && !isSuperAdmin) continue
      if (!habilitados.has(item.href)) continue        // Camada 1: opt-in do segmento
      if (hidden.has(item.href)) continue              // Camada 3/4: dono/superadmin ocultou
      if (item.adminOnly && !isAdmin) continue         // Camada 5: papel
      // Camada 2/3: plano + override de módulo
      const forcado = item.modulo ? overrides?.modulos?.[item.modulo] : undefined
      if (forcado === false) continue // superadmin bloqueou explicitamente
      const locked = !!item.modulo && !isSuperAdmin && forcado !== true && !planoTemAcesso(plano, item.modulo)

      items.push({ ...item, label: labels[item.href] ?? item.label, locked })
    }
    if (items.length > 0) out.push({ label: g.label, items })
  }

  /**
   * Extras do segmento que NÃO existem no catálogo comum.
   *
   * Passam pelo mesmo opt-in (`habilitados`) e pelo mesmo "ocultar" do dono; o que
   * eles não têm é `adminOnly`, porque tela que o segmento declara como sua é tela
   * do time dele. Quem depende de papel trava na própria página.
   */
  const noCatalogo = new Set(CATALOGO.flatMap((g) => g.items).map((i) => i.href))
  /**
   * LISTA VAZIA DO BANCO NÃO É "NENHUM EXTRA" — É "NÃO CONFIGURADO".
   *
   * Era `segOverride?.modulosExtra ?? seg.modulosExtra`: com `modulos_extra = []`
   * em `segmentos_config` (o estado real da imobiliária em 20/08/2026), o array
   * vazio NÃO é nulo, então vencia o código e derrubava todos os extras. Foi assim
   * que "Metas e Ranking" sumiu do menu dela — e, junto, o acesso do corretor à
   * tela, que se apoia na mesma declaração.
   *
   * Mesma regra que já vale para `modulos_habilitados`: lista vazia não bloqueia,
   * ela só não diz nada. Para TIRAR um extra existe `hidden_hrefs`.
   */
  const extras = segOverride?.modulosExtra?.length ? segOverride.modulosExtra : (seg.modulosExtra ?? [])
  for (const ex of extras) {
    if (noCatalogo.has(ex.href)) continue
    if (!habilitados.has(ex.href)) continue
    if (hidden.has(ex.href)) continue
    const item: MenuItem = {
      href: ex.href,
      label: labels[ex.href] ?? ex.label,
      icon: ex.icon,
      locked: false,
    }
    const grupo = ex.grupo ?? 'Operação'
    const alvo = out.find((g) => g.label === grupo)
    if (alvo) alvo.items.push(item)
    else out.push({ label: grupo, items: [item] })
  }

  /**
   * ORDEM DO MENU, aplicada por último e EM CAMADAS.
   *
   * Roda depois de tudo — opt-in, ocultos, papel e plano — para reordenar apenas o
   * que sobrou. As camadas, da mais genérica para a mais específica:
   *   1. código      (`seg.menuLayout`, o molde da vertical)
   *   2. superadmin  (`segOverride.menuLayout`, editável na tela de Segmentos)
   *   3. dono        (`configDono.ordem`, arrastado em /admin/meu-menu)
   *
   * A mescla é RASA de propósito: quem declara "Hoje" manda em "Hoje" inteiro, e
   * não em metade dele. Mescla profunda produziria uma ordem que ninguém escolheu
   * — pedaço do dono intercalado com pedaço do molde.
   *
   * Grupo ausente do layout conserva a ordem do catálogo, e item que ninguém
   * declarou fica no fim do grupo dele: módulo novo aparece em vez de sumir.
   */
  const layout: Record<string, string[]> = {
    ...(seg.menuLayout ?? {}),
    ...(segOverride?.menuLayout ?? {}),
    ...(configDono?.ordem ?? {}),
  }
  for (const [grupo, hrefs] of Object.entries(layout)) {
    if (grupo === CHAVE_GRUPOS) continue
    if (!Array.isArray(hrefs)) continue
    const trazidos: MenuItem[] = []
    for (const href of hrefs) {
      for (const g of out) {
        const i = g.items.findIndex((it) => it.href === href)
        if (i >= 0) { trazidos.push(g.items.splice(i, 1)[0]); break }
      }
    }
    if (!trazidos.length) continue
    const alvo = out.find((g) => g.label === grupo)
    if (alvo) alvo.items = [...trazidos, ...alvo.items]
    else out.push({ label: grupo, items: trazidos })
  }

  /**
   * Ordem das CAIXAS. Grupo fora da lista vai para o fim, na ordem em que estava —
   * assim um grupo novo (criado por um módulo extra) não desaparece do menu nem
   * salta para o topo por acidente.
   */
  const ordemGrupos = layout[CHAVE_GRUPOS]
  if (Array.isArray(ordemGrupos) && ordemGrupos.length > 0) {
    const posicao = (label: string) => {
      const i = ordemGrupos.indexOf(label)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    out.sort((a, b) => posicao(a.label) - posicao(b.label))
  }

  return out.filter((g) => g.items.length > 0)
}

/**
 * Chave da ordem PLANA do menu: uma lista só de hrefs, sem grupo.
 *
 * O menu do CRM não mostra mais separadores ("Hoje", "Comercial", "Operação"…) —
 * decisão do dono em 20/08/2026. Sem cabeçalho na tela, ordenar "por grupo" deixa
 * de fazer sentido: quem arrasta quer o Financeiro logo abaixo do Dashboard, e o
 * formato antigo (`{grupo: [hrefs]}`) não sabe representar isso, porque a
 * renderização concatenava grupo por grupo.
 *
 * Os grupos seguem existindo DENTRO do catálogo: é o que dá uma sequência inicial
 * razoável a quem nunca arrastou nada, e é como os módulos novos entram em algum
 * lugar previsível. Eles só não aparecem mais.
 */
export const CHAVE_ORDEM = '__ordem'

/**
 * Achata os grupos numa lista única, aplicando a ordem escolhida.
 *
 * Href que está na ordem salva vem primeiro, na sequência pedida. O que ninguém
 * posicionou segue depois, na ordem do catálogo — módulo novo aparece no fim em vez
 * de sumir ou de saltar para o topo. Href salvo que não existe mais (plano trocado,
 * módulo desligado) é simplesmente ignorado.
 */
export function achatarMenu(grupos: MenuGroup[], ordem?: string[]): MenuItem[] {
  const todos = grupos.flatMap((g) => g.items)
  if (!ordem?.length) return todos

  const porHref = new Map(todos.map((i) => [i.href, i]))
  const saida: MenuItem[] = []
  const usados = new Set<string>()
  for (const href of ordem) {
    const item = porHref.get(href)
    if (item && !usados.has(href)) { saida.push(item); usados.add(href) }
  }
  for (const item of todos) if (!usados.has(item.href)) saida.push(item)
  return saida
}

/**
 * O menu como o CRM desenha: uma lista, na ordem final.
 *
 * Existe para que sidebar, gaveta do celular e a folha "Mais" não repitam (e
 * divirjam em) a mesma conta de camadas — foi o que aconteceu com os rótulos, que
 * o menu aplicava e a barra do topo não.
 */
export function resolverMenuPlano(input: ResolverMenuInput): MenuItem[] {
  const grupos = resolverMenu(input)
  const ordem = input.configDono?.ordem?.[CHAVE_ORDEM]
    ?? input.segOverride?.menuLayout?.[CHAVE_ORDEM]
    ?? SEGMENTOS[input.segmento]?.menuLayout?.[CHAVE_ORDEM]
  return achatarMenu(grupos, ordem)
}
