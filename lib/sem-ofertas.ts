/**
 * "NÃO QUERO RECEBER OFERTAS" (24/11/2026; migração 20261124001900). Universal, do core.
 *
 * `contatos.sem_ofertas_em` só barra modelo de MARKETING. O `opt_out_em` (Automatize) continua barrando tudo.
 * Transmissão, Automatize e pós-venda conferem aqui com a mesma regra.
 */
export const MOTIVO_SEM_OFERTAS = 'contato pediu para não receber ofertas (modelo de Marketing)'

export function barradoPorSemOfertas(categoriaDoModelo: string | null | undefined, semOfertasEm: string | null | undefined): boolean {
  return !!semOfertasEm && (categoriaDoModelo ?? '').toUpperCase() === 'MARKETING'
}
