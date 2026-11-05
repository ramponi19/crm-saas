import { MODULOS, moduloPorChave, type ModuloManifesto } from '@/core/modulos'
import { planoMinimo, planoTemAcesso, type ModuloPlano } from '@/lib/plano'

/**
 * O ESTADO DE CADA TILE DA CENTRAL DE MÓDULOS (22/10/2026) — regra pura, sem
 * banco: quem chama já leu as camadas (lib/empresa-config.ts) e o conjunto de
 * módulos ligados (`hrefsHabilitados`, a mesma conta do menu). Testada em
 * tests/modulos-central.test.ts.
 *
 *   preparacao  a tela ainda não serve para qualquer empresa: sem botão;
 *   pago        fora do plano da empresa, ou contratado à parte: o botão pede;
 *   instalado   ligado nesta empresa: o dono pode desinstalar (menos o que é contratado
 *               e o que outro módulo ligado usa — `usadoPor`, 04/11/2026);
 *   disponivel  pode instalar agora; `junto` = os requisitos que ligam com ele, e
 *               `bloqueio` = o requisito que não dá para ligar pelo botão (pago ou em
 *               preparação), com o motivo.
 *
 * DEPENDÊNCIAS (04/11/2026, `requer` no manifesto): a conta é transitiva — Avaliação
 * requer PDV, que requer Estoque. Instalar liga junto o que falta; desinstalar fica
 * bloqueado enquanto um módulo LIGADO depender (direta ou indiretamente) do que sai.
 */
export type EstadoModulo =
  | { tipo: 'preparacao' }
  | { tipo: 'pago'; onde: string }
  | { tipo: 'instalado'; podeDesinstalar: boolean; usadoPor?: string[] }
  | { tipo: 'disponivel'; junto?: string[]; bloqueio?: string }

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
  /** Os requisitos que ainda não estão ligados (nomes): vão junto ao instalar ou no pedido. */
  faltam: string[]
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

/** Ligado nesta empresa: o contratado à parte pela linha ativa; o resto pelo menu ligado. */
export function estaLigado(m: ModuloManifesto, e: Pick<EntradaCentral, 'ligados' | 'ativos'>): boolean {
  return m.addon ? e.ativos.has(m.chave) : e.ligados.has(m.href)
}

/**
 * Todos os requisitos de um módulo, transitivos, do mais fundo para o mais raso
 * (a ordem em que se instalam: Estoque antes do PDV antes da Avaliação). Chave
 * fora do manifesto é ignorada; ciclo não trava (cada chave entra uma vez).
 */
export function requisitosDe(m: ModuloManifesto): ModuloManifesto[] {
  const vistos = new Set<string>([m.chave])
  const ordem: ModuloManifesto[] = []
  const visitar = (x: ModuloManifesto) => {
    for (const c of x.requer ?? []) {
      const r = moduloPorChave(c)
      if (!r || vistos.has(r.chave)) continue
      vistos.add(r.chave)
      visitar(r)
      ordem.push(r)
    }
  }
  visitar(m)
  return ordem
}

/** Os requisitos (transitivos) que ainda não estão ligados, na ordem de instalar. */
export function requisitosFaltando(m: ModuloManifesto, e: EntradaCentral): ModuloManifesto[] {
  return requisitosDe(m).filter((r) => !estaLigado(r, e))
}

/** Os módulos LIGADOS que dependem deste, direta ou indiretamente (bloqueiam desinstalar). */
export function dependentesLigados(m: ModuloManifesto, e: EntradaCentral): ModuloManifesto[] {
  return MODULOS.filter((x) => x.chave !== m.chave && estaLigado(x, e) && requisitosDe(x).some((r) => r.chave === m.chave))
}

/** Pago ou em preparação, sem olhar requisitos: o que o botão não instala sozinho. */
function travaPropria(m: ModuloManifesto, e: EntradaCentral): EstadoModulo | null {
  if (m.emPreparacao) return { tipo: 'preparacao' }
  if (m.addon) return estaLigado(m, e) ? null : { tipo: 'pago', onde: 'contratado à parte' }
  if (m.plano && e.forcados?.[m.plano] !== true && !planoTemAcesso(e.plano, m.plano)) {
    return { tipo: 'pago', onde: `no plano ${NOME_PLANO[planoMinimo(m.plano)] ?? planoMinimo(m.plano)}` }
  }
  return null
}

/** Por que um requisito que falta não liga pelo botão (pago ou em preparação), ou null. */
export function motivoDoRequisito(r: ModuloManifesto, e: EntradaCentral): string | null {
  const t = travaPropria(r, e)
  if (!t) return null
  if (t.tipo === 'preparacao') return `Precisa de ${r.nome}, que ainda está em preparação.`
  if (t.tipo === 'pago') return `Precisa de ${r.nome}, que é ${t.onde}: peça ${r.nome} primeiro.`
  return null
}

export function estadoDoModulo(m: ModuloManifesto, e: EntradaCentral): EstadoModulo {
  const trava = travaPropria(m, e)
  if (trava) return trava
  if (estaLigado(m, e)) {
    if (m.addon) return { tipo: 'instalado', podeDesinstalar: false }
    const usam = dependentesLigados(m, e).map((x) => x.nome)
    return usam.length ? { tipo: 'instalado', podeDesinstalar: false, usadoPor: usam } : { tipo: 'instalado', podeDesinstalar: true }
  }
  const faltam = requisitosFaltando(m, e)
  if (faltam.length === 0) return { tipo: 'disponivel' }
  const bloqueio = faltam.map((r) => motivoDoRequisito(r, e)).find(Boolean)
  return { tipo: 'disponivel', junto: faltam.map((r) => r.nome), ...(bloqueio ? { bloqueio } : {}) }
}

export function tilesDaCentral(e: EntradaCentral): TileModulo[] {
  return MODULOS.map((m) => ({
    ...m, estado: estadoDoModulo(m, e),
    pedidoEm: e.pedidos?.[m.href] ?? null,
    recusadoEm: e.pedidos?.[m.href] ? null : e.recusas?.[m.href] ?? null,
    faltam: requisitosFaltando(m, e).map((r) => r.nome),
  }))
}
