/**
 * Permissões por papel dentro da empresa (Fase 2.B). Persistido em
 * `empresas.permissoes jsonb`. owner é sempre total (não editável).
 */

export type Papel = 'owner' | 'admin' | 'vendedor' | 'tecnico'

export interface PermissoesPapel {
  verFinanceiro: boolean
  verRelatorios: boolean
  verLeadsOutros: boolean
  /**
   * Ver venda, histórico, orçamento e números de OUTRAS pessoas.
   *
   * Separada de `verLeadsOutros` porque são perguntas diferentes: quem atende a
   * esteira precisa ver lead livre, e nem por isso precisa ver quanto o colega
   * vendeu. Sem ela, o dashboard de um vendedor mostrava o faturamento da loja
   * inteira.
   */
  verVendasOutros: boolean
  excluir: boolean
  exportar: boolean
  descontoMax: number // % máximo de desconto no PDV
}

export type PermissoesMap = Partial<Record<Papel, Partial<PermissoesPapel>>>

/** Papéis que o dono pode configurar (owner é sempre total). */
export const PAPEIS_EDITAVEIS: Papel[] = ['admin', 'vendedor', 'tecnico']

export const PERM_LABELS: { key: keyof Omit<PermissoesPapel, 'descontoMax'>; label: string }[] = [
  { key: 'verFinanceiro', label: 'Ver Financeiro' },
  { key: 'verRelatorios', label: 'Ver Relatórios' },
  { key: 'verLeadsOutros', label: 'Ver leads de outros' },
  { key: 'verVendasOutros', label: 'Ver vendas e resultados de outros' },
  { key: 'excluir', label: 'Excluir registros' },
  { key: 'exportar', label: 'Exportar dados' },
]

export const PERM_DEFAULT: Record<Papel, PermissoesPapel> = {
  owner: { verFinanceiro: true, verRelatorios: true, verLeadsOutros: true, verVendasOutros: true, excluir: true, exportar: true, descontoMax: 100 },
  admin: { verFinanceiro: true, verRelatorios: true, verLeadsOutros: true, verVendasOutros: true, excluir: true, exportar: true, descontoMax: 100 },
  vendedor: { verFinanceiro: false, verRelatorios: false, verLeadsOutros: false, verVendasOutros: false, excluir: false, exportar: false, descontoMax: 10 },
  // Técnico mexe em ordem de serviço, não em venda: número de faturamento não é
  // assunto dele, mas lead ele precisa enxergar para atender o balcão.
  tecnico: { verFinanceiro: false, verRelatorios: false, verLeadsOutros: true, verVendasOutros: false, excluir: false, exportar: false, descontoMax: 0 },
}

/** Permissões efetivas de um papel (default + o que o dono salvou; owner = total). */
export function permsDoPapel(papel: string | null | undefined, saved?: PermissoesMap | null): PermissoesPapel {
  const p = (papel ?? 'vendedor') as Papel
  if (p === 'owner') return { ...PERM_DEFAULT.owner }
  return { ...(PERM_DEFAULT[p] ?? PERM_DEFAULT.vendedor), ...((saved?.[p] ?? {}) as Partial<PermissoesPapel>) }
}
