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
  /**
   * O último pedido deste módulo foi RECUSADO (e não há outro em aberto): quando.
   * O dono vê a recusa e pode pedir de novo (04/11/2026; desde a viagem 1 recusar
   * não apaga, marca `status = 'recusado'`).
   */
  recusadoEm: string | null
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
  /** href → quando o último pedido foi recusado (só quando não há pedido em aberto). */
  recusas?: Record<string, string>
}

/** Linha de `modulo_pedidos` como a Central lê (pendentes e recusados da empresa). */
export interface PedidoDaEmpresa { modulo: string; status: string; pedido_em: string; recusado_em: string | null }

/**
 * Por módulo, só o pedido MAIS RECENTE conta: em aberto vira "Pedido enviado";
 * recusado vira "Pedido recusado — pedir de novo". Um pedido novo depois da recusa
 * esconde a recusa antiga.
 */
export function pedidosERecusas(linhas: PedidoDaEmpresa[]): { pedidos: Record<string, string>; recusas: Record<string, string> } {
  const ultimo = new Map<string, PedidoDaEmpresa>()
  for (const p of linhas) {
    const atual = ultimo.get(p.modulo)
    if (!atual || p.pedido_em > atual.pedido_em) ultimo.set(p.modulo, p)
  }
  const pedidos: Record<string, string> = {}
  const recusas: Record<string, string> = {}
  for (const [href, p] of ultimo) {
    if (p.status === 'pendente') pedidos[href] = p.pedido_em
    else if (p.status === 'recusado' && p.recusado_em) recusas[href] = p.recusado_em
  }
  return { pedidos, recusas }
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
  return MODULOS.map((m) => ({
    ...m, estado: estadoDoModulo(m, e),
    pedidoEm: e.pedidos?.[m.href] ?? null,
    recusadoEm: e.pedidos?.[m.href] ? null : e.recusas?.[m.href] ?? null,
  }))
}
