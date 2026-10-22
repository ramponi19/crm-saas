import { MODULOS, type ModuloManifesto } from '@/core/modulos'
import { planoMinimo, planoTemAcesso, type ModuloPlano } from '@/lib/plano'

/**
 * O ESTADO DE CADA TILE DA CENTRAL DE MÓDULOS (22/10/2026) — regra pura, sem
 * banco: quem chama já leu as camadas (lib/empresa-config.ts) e o conjunto de
 * módulos ligados (`hrefsHabilitados`, a mesma conta do menu). Testada em
 * tests/modulos-central.test.ts.
 *
 *   preparacao  a tela ainda não serve para qualquer empresa: sem botão;
 *   pago        fora do plano da empresa, ou contratado à parte: o botão pede;
 *   instalado   ligado nesta empresa: o dono pode desinstalar (menos o que é contratado);
 *   disponivel  pode instalar agora.
 */
export type EstadoModulo =
  | { tipo: 'preparacao' }
  | { tipo: 'pago'; onde: string }
  | { tipo: 'instalado'; podeDesinstalar: boolean }
  | { tipo: 'disponivel' }

export interface TileModulo extends ModuloManifesto {
  estado: EstadoModulo
  /** Pedido em aberto desta empresa (modulo_pedidos), se houver. */
  pedidoEm: string | null
}

const NOME_PLANO: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro' }

export interface EntradaCentral {
  /** Os módulos ligados para a empresa (`hrefsHabilitados`). */
  ligados: Set<string>
  plano: string | undefined
  /** Recursos de plano forçados pelo superadmin (empresa_modulos.config.forcado). */
  forcados?: Partial<Record<ModuloPlano, boolean>>
  /** Chaves de empresa_modulos com `ativo = true` (para o que não é item de menu, como o ZapIntel). */
  ativos: Set<string>
  /** href → quando foi pedido (pedidos em aberto). */
  pedidos?: Record<string, string>
}

export function estadoDoModulo(m: ModuloManifesto, e: EntradaCentral): EstadoModulo {
  if (m.emPreparacao) return { tipo: 'preparacao' }
  const instalado = m.addon ? e.ativos.has(m.chave) : e.ligados.has(m.href)
  if (m.addon) return instalado ? { tipo: 'instalado', podeDesinstalar: false } : { tipo: 'pago', onde: 'contratado à parte' }
  if (m.plano && e.forcados?.[m.plano] !== true && !planoTemAcesso(e.plano, m.plano)) {
    return { tipo: 'pago', onde: `no plano ${NOME_PLANO[planoMinimo(m.plano)] ?? planoMinimo(m.plano)}` }
  }
  return instalado ? { tipo: 'instalado', podeDesinstalar: true } : { tipo: 'disponivel' }
}

export function tilesDaCentral(e: EntradaCentral): TileModulo[] {
  return MODULOS.map((m) => ({ ...m, estado: estadoDoModulo(m, e), pedidoEm: e.pedidos?.[m.href] ?? null }))
}
