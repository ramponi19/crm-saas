/**
 * Os extras do plano único (18/11/2026): o que se compra além do plano base, fora os módulos da Central.
 * O preço mora em precos_adicionais (editável no superadmin); aqui só o que cada extra é.
 */
export const EXTRAS = [
  { chave: 'usuario', nome: 'Usuário adicional', unidade: 'por usuário, por mês' },
  { chave: 'numero', nome: 'Número de WhatsApp adicional', unidade: 'por número, por mês' },
  { chave: 'loja', nome: 'Loja adicional', unidade: 'por loja, por mês' },
] as const

export interface PrecoAdicional {
  chave: string
  tipo: 'modulo' | 'extra'
  nome: string
  preco_centavos: number | null
  unidade: string
  ativo: boolean
}

/** "R$ 49/mês", "R$ 49,90/mês" ou "a definir". */
export function textoPreco(centavos: number | null | undefined): string {
  if (centavos == null) return 'a definir'
  if (centavos === 0) return 'Grátis'
  return `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: centavos % 100 ? 2 : 0, maximumFractionDigits: 2 })}/mês`
}
