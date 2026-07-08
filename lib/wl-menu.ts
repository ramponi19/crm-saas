/**
 * White-label do menu (Fase 2.5). SOMENTE a barra lateral é personalizável;
 * o resto do produto fica sempre no tema Precisão (modelo Slack).
 *
 * A sidebar consome 4 CSS variables — a partir de `empresas.wl_menu`:
 *   --sb-bg · --sb-text · --sb-active-bg · --sb-active-text
 */

export type WlPreset = 'clara' | 'escura' | 'custom'

export interface WlMenu {
  preset: WlPreset
  fundo?: string
  texto?: string
  ativo_fundo?: string
  ativo_texto?: string
}

export interface SidebarTheme {
  bg: string
  text: string
  activeBg: string
  activeText: string
  /** true quando o fundo é escuro — ajusta bordas/hover. */
  dark: boolean
}

// Presets embutidos (não persistem cores, só o nome).
const CLARA: SidebarTheme = {
  bg: '#FCFCFB',
  text: '#5C6470',
  activeBg: 'rgba(46,92,230,.08)',
  activeText: '#2E5CE6',
  dark: false,
}
const ESCURA: SidebarTheme = {
  bg: 'linear-gradient(180deg,#16212E,#111A24)',
  text: '#93A2B5',
  activeBg: 'linear-gradient(90deg,rgba(201,162,75,.22),rgba(201,162,75,.04))',
  activeText: '#FFFFFF',
  dark: true,
}

/** Luminância relativa de um hex (#rgb/#rrggbb) — WCAG. */
function luminance(hex: string): number | null {
  const m = hex.trim().replace('#', '')
  const s = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(s.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** Razão de contraste WCAG entre dois hex. Retorna null se algum não for hex sólido. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a), lb = luminance(b)
  if (la == null || lb == null) return null
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

function isDarkHex(hex: string): boolean {
  const l = luminance(hex)
  return l != null && l < 0.4
}

/** Resolve o tema da sidebar a partir do wl_menu (e do legado wl_cor). */
export function resolveTheme(wlMenu: WlMenu | null | undefined, wlCor?: string | null): SidebarTheme {
  if (wlMenu?.preset === 'escura') return ESCURA
  if (wlMenu?.preset === 'custom' && wlMenu.fundo && wlMenu.texto && wlMenu.ativo_fundo && wlMenu.ativo_texto) {
    return {
      bg: wlMenu.fundo,
      text: wlMenu.texto,
      activeBg: wlMenu.ativo_fundo,
      activeText: wlMenu.ativo_texto,
      dark: isDarkHex(wlMenu.fundo),
    }
  }
  // Sem wl_menu mas com wl_cor legado → deriva um custom claro com o accent do tenant.
  if (!wlMenu && wlCor && /^#[0-9a-fA-F]{3,6}$/.test(wlCor)) {
    return { bg: CLARA.bg, text: CLARA.text, activeBg: 'rgba(46,92,230,.08)', activeText: wlCor, dark: false }
  }
  return CLARA
}

/** Objeto de CSS variables para injetar no elemento da sidebar. */
export function themeVars(t: SidebarTheme): React.CSSProperties {
  return {
    '--sb-bg': t.bg,
    '--sb-text': t.text,
    '--sb-active-bg': t.activeBg,
    '--sb-active-text': t.activeText,
  } as React.CSSProperties
}
