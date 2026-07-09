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
  modulosExtra?: { href: string; label: string; icon: string }[]
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

// Nunca podem ser ocultados pela config do dono (camada 4).
const PROTEGIDOS = new Set(['/dashboard', '/configuracoes'])

// Núcleo: sempre habilitado, independente do opt-in do segmento.
const NUCLEO = new Set(['/dashboard', '/leads', '/clientes'])

/** Hrefs do catálogo que NÃO são opcionais (base comum a todo segmento). */
export function hrefsBase(): string[] {
  return CATALOGO.flatMap((g) => g.items).filter((i) => !i.opcional).map((i) => i.href)
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
 * segmento (modulosExtra) são injetados em "Operação" por resolverMenu.
 * Itens de Fase 4 (Propostas em Comercial, Metas em Gestão) entram depois — os
 * grupos já ficam prontos.
 */
export const CATALOGO: MenuGroupBase[] = [
  {
    label: 'Hoje',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
      { href: '/tarefas', label: 'Tarefas', icon: 'CheckSquare' },
      { href: '/agenda', label: 'Agenda', icon: 'Calendar' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/leads', label: 'Leads', icon: 'Target', badge: 'leads' },
      { href: '/clientes', label: 'Clientes', icon: 'Users' },
      { href: '/propostas', label: 'Propostas', icon: 'FileText', adminOnly: true },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/pdv', label: 'PDV', icon: 'ScanBarcode' },
      { href: '/historico', label: 'Histórico', icon: 'ReceiptText' },
      { href: '/simular-parcela', label: 'Simular parcela', icon: 'Calculator' },
      { href: '/produtos', label: 'Produtos', icon: 'Smartphone' },
      { href: '/estoque', label: 'Estoque', icon: 'Boxes' },
      { href: '/catalogo', label: 'Catálogo', icon: 'BookOpen' },
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
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/relatorios', label: 'Relatórios', icon: 'BarChart3', modulo: 'bi', adminOnly: true },
      { href: '/metas', label: 'Metas', icon: 'Gauge', adminOnly: true },
      { href: '/financeiro', label: 'Financeiro', icon: 'Wallet', adminOnly: true },
      { href: '/equipe', label: 'Equipe', icon: 'UserCog', modulo: 'multi_usuario', adminOnly: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/funil', label: 'Funil', icon: 'GitBranch', adminOnly: true },
      { href: '/meu-menu', label: 'Meu menu', icon: 'SlidersHorizontal', adminOnly: true },
      { href: '/permissoes', label: 'Permissões', icon: 'Shield', adminOnly: true },
      { href: '/aparencia', label: 'Aparência', icon: 'Palette', adminOnly: true },
      { href: '/configuracoes', label: 'Configurações', icon: 'Settings', adminOnly: true },
      { href: '/empresa', label: 'Minha empresa', icon: 'Building2', adminOnly: true },
      { href: '/planos', label: 'Planos', icon: 'CreditCard', adminOnly: true },
    ],
  },
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
  return out
}
