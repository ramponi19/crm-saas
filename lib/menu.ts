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

export type BadgeKey = 'leads' | 'garantia'

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
}

/** Config do dono dentro da própria empresa (camada 4). Preenchido na Fase 2.B. */
export interface MenuConfigDono {
  hidden?: string[]
  labels?: Record<string, string>
}

/** Config do segmento vinda do banco (segmentos_config) — sobrepõe o SEGMENTOS estático. */
export interface SegOverride {
  hiddenHrefs?: string[]
  labelOverrides?: Record<string, string>
  modulosExtra?: { href: string; label: string; icon: string; grupo?: string }[]
  /** Opt-in: hrefs habilitados neste segmento (novo modelo). Se presente, tem precedência. */
  habilitados?: string[]
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
      { href: '/chat', label: 'Chat', icon: 'MessageSquare', opcional: true },
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
      { href: '/proprietarios', label: 'Proprietários', icon: 'KeyRound', opcional: true },
      { href: '/chaves', label: 'Chaves', icon: 'Key', opcional: true },
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
      { href: '/conversao', label: 'Conversão', icon: 'Filter', adminOnly: true },
      { href: '/metas', label: 'Metas', icon: 'Gauge', adminOnly: true },
      { href: '/financeiro', label: 'Financeiro', icon: 'Wallet', adminOnly: true },
      { href: '/equipe', label: 'Equipe', icon: 'UserCog', modulo: 'multi_usuario', adminOnly: true },
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
  const extras = segOverride?.modulosExtra ?? seg.modulosExtra ?? []
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
   * Ordem declarada pelo segmento (`menuLayout`), aplicada por último.
   *
   * Roda depois de tudo — opt-in, ocultos, papel e plano — para reordenar apenas o
   * que sobrou. Grupo que ficou vazio sai: "Comercial" sem itens é cabeçalho solto.
   */
  for (const [grupo, hrefs] of Object.entries(seg.menuLayout ?? {})) {
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

  return out.filter((g) => g.items.length > 0)
}
