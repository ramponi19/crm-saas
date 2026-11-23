/**
 * VENDA FECHADA COM OS DADOS DA VENDA (Entrega A do pós-venda, 23/11/2026).
 *
 * Marcar um negócio como ganho passou a exigir, em TODO caminho de tela, os quatro dados que a
 * régua de pós-venda e a janela da Edge precisam (docs/design-pos-venda.md §2.3):
 *   - data da venda (padrão hoje; nunca no futuro; não antes de 2024; até 30 dias antes da criação
 *     do negócio — além disso é registro antigo e vai por corrigir_data_venda);
 *   - categoria da compra (lista da empresa; se a empresa não tem categoria cadastrada, não é exigida);
 *   - condição: novo ou usado (o rótulo do usado é o vocabulário da empresa);
 *   - valor da venda (> 0).
 * A data vira `ganho_em`: meio-dia no fuso da empresa (hoje = o instante atual). Antes era o
 * instante do clique, e a equipe marca o ganho dias depois da venda — a régua e a janela da Edge
 * saíam deslocadas.
 *
 * Função pura: a rota (/api/leads/mover) valida com ela e a tela usa as mesmas regras.
 */
import { diaNoFuso, instanteLocal, somarDias } from '@/lib/datas'

export type CondicaoVenda = 'novo' | 'seminovo'
/** Rótulos padrão; o de "usado" a empresa troca pelo vocabulário (PerfilDoLead.rotuloUsado). */
export const CONDICOES: { id: CondicaoVenda; rotulo: string }[] = [
  { id: 'novo', rotulo: 'Novo' },
  { id: 'seminovo', rotulo: 'Usado' },
]
/** Primeiro dia aceito (o grupo de pedidos da JM começa em mar/2024). Igual ao corrigir_data_venda. */
export const DATA_MINIMA = '2024-01-01'
/** Quantos dias antes da criação do negócio a venda ainda pode ser datada pela tela. */
export const TOLERANCIA_ANTES_DO_NEGOCIO = 30
export const VALOR_MAXIMO = 10_000_000

/** O que a tela manda no corpo de /api/leads/mover (`venda`). */
export interface VendaInformada {
  data?: unknown
  categoria_id?: unknown
  condicao?: unknown
  valor?: unknown
}

export interface VendaValida {
  data: string
  categoria_id: number | null
  condicao: CondicaoVenda
  valor: number
}

export interface ContextoVenda {
  /** Hoje no fuso da empresa (YYYY-MM-DD). */
  hoje: string
  /** Dia de criação do negócio no fuso da empresa (YYYY-MM-DD). */
  criadoEm: string
  /** Ids das categorias ativas da empresa. Vazio = a empresa não usa categoria (não exigida). */
  categorias: number[]
}

export type CampoVenda = 'data' | 'categoria_id' | 'condicao' | 'valor'
export type ResultadoVenda =
  | { ok: true; venda: VendaValida }
  | { ok: false; campo: CampoVenda; erro: string }

const DIA = /^\d{4}-\d{2}-\d{2}$/

function diaValido(s: string): boolean {
  if (!DIA.test(s)) return false
  const [a, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d))
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** "R$ 7.995,00" | "7995,5" | 7995.5 → número; texto que não é valor → NaN. */
export function lerValor(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return Number.NaN
  const limpo = v.replace(/R\$|\s/g, '')
  if (!limpo) return Number.NaN
  // Com vírgula: padrão brasileiro (ponto = milhar). Sem vírgula: ponto é decimal só se tiver 1-2 casas.
  const normal = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, '') : limpo
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN
}

export function validarVendaGanho(entrada: VendaInformada | null | undefined, ctx: ContextoVenda): ResultadoVenda {
  const v = entrada ?? {}
  const data = typeof v.data === 'string' ? v.data.trim() : ''
  if (!data || !diaValido(data)) return { ok: false, campo: 'data', erro: 'Informe a data da venda.' }
  if (data > ctx.hoje) return { ok: false, campo: 'data', erro: 'A data da venda não pode ser depois de hoje.' }
  if (data < DATA_MINIMA) return { ok: false, campo: 'data', erro: 'Datas antes de 2024 não são aceitas.' }
  if (data < somarDias(ctx.criadoEm, -TOLERANCIA_ANTES_DO_NEGOCIO)) {
    return { ok: false, campo: 'data', erro: `A data é mais de ${TOLERANCIA_ANTES_DO_NEGOCIO} dias anterior a este negócio. Para registro antigo, marque o ganho e use "Corrigir data da venda" (dono ou administrador).` }
  }

  let categoria: number | null = null
  if (ctx.categorias.length > 0) {
    const c = typeof v.categoria_id === 'number' ? v.categoria_id : Number(v.categoria_id)
    if (!Number.isInteger(c) || !ctx.categorias.includes(c)) return { ok: false, campo: 'categoria_id', erro: 'Escolha a categoria da compra.' }
    categoria = c
  }

  if (v.condicao !== 'novo' && v.condicao !== 'seminovo') return { ok: false, campo: 'condicao', erro: 'Escolha a condição.' }

  const valor = lerValor(v.valor)
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, campo: 'valor', erro: 'Informe o valor da venda.' }
  if (valor > VALOR_MAXIMO) return { ok: false, campo: 'valor', erro: 'Valor alto demais — confira os zeros.' }

  return { ok: true, venda: { data, categoria_id: categoria, condicao: v.condicao, valor: Math.round(valor * 100) / 100 } }
}

/** `ganho_em` da data da venda: hoje = o instante atual; outro dia = meio-dia no fuso da empresa. */
export function ganhoEmDaData(data: string, fuso: string, agora: Date = new Date()): string {
  return data === diaNoFuso(agora, fuso) ? agora.toISOString() : instanteLocal(data, '12:00', fuso).toISOString()
}
