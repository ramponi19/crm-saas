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

export interface ResolverMenuInput {
  segmento: Segmento
  plano?: string
  role: string
  isSuperAdmin: boolean
  overrides?: MenuOverridesSuperadmin
  configDono?: MenuConfigDono
}

// Nunca podem ser ocultados pela config do dono (camada 4).
const PROTEGIDOS = new Set(['/dashboard', '/configuracoes'])

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
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/relatorios', label: 'Relatórios', icon: 'BarChart3', modulo: 'bi', adminOnly: true },
      { href: '/financeiro', label: 'Financeiro', icon: 'Wallet', adminOnly: true },
      { href: '/equipe', label: 'Equipe', icon: 'UserCog', modulo: 'multi_usuario', adminOnly: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/funil', label: 'Funil', icon: 'GitBranch', adminOnly: true },
      { href: '/aparencia', label: 'Aparência', icon: 'Palette', adminOnly: true },
      { href: '/configuracoes', label: 'Configurações', icon: 'Settings', adminOnly: true },
      { href: '/empresa', label: 'Minha empresa', icon: 'Building2', adminOnly: true },
      { href: '/planos', label: 'Planos', icon: 'CreditCard', adminOnly: true },
    ],
  },
]

export function resolverMenu(input: ResolverMenuInput): MenuGroup[] {
  const { segmento, plano, role, isSuperAdmin, overrides, configDono } = input
  const seg = SEGMENTOS[segmento]
  const isAdmin = isSuperAdmin || role === 'owner' || role === 'admin'

  // Camadas 1 (segmento) + 3 (superadmin) + 4 (dono) de hidden/labels.
  const donoHidden = (configDono?.hidden ?? []).filter((h) => !PROTEGIDOS.has(h))
  const hidden = new Set<string>([...seg.hiddenHrefs, ...(overrides?.hidden ?? []), ...donoHidden])
  const labels: Record<string, string> = {
    ...seg.labelOverrides,
    ...(overrides?.labels ?? {}),
    ...(configDono?.labels ?? {}),
  }

  // Injeta os módulos exclusivos do segmento em "Operação".
  const extras: MenuItemBase[] = (seg.modulosExtra ?? []).map((m) => ({ href: m.href, label: m.label, icon: m.icon }))

  const grupos = CATALOGO.map((g) => ({
    label: g.label,
    items: g.label === 'Operação' ? [...g.items, ...extras] : g.items,
  }))

  const out: MenuGroup[] = []
  for (const g of grupos) {
    const items: MenuItem[] = []
    for (const item of g.items) {
      // Camada 1/3/4: visibilidade
      if (hidden.has(item.href)) continue
      // Camada 5: papel
      if (item.adminOnly && !isAdmin) continue
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
