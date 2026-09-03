import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { temHrefLiberado, type MenuOverrideRow } from '@/lib/menu'

/**
 * O href que liga a cotação de troca para uma empresa.
 *
 * Não está no CATALOGO de propósito: a cotação é ABA de Orçamentos, não item de
 * sidebar (foi a escolha do dono — um menu só, abas dentro). Como href fora do
 * catálogo, ele libera a aba e não desenha nada no menu. Ver
 * `MenuOverridesSuperadmin.habilitados`.
 *
 * É também a rota real (`/orcamentos/cotacao`), então o href não é uma etiqueta
 * inventada: é o endereço da tela que ele libera.
 */
export const HREF_COTACAO_TROCA = '/orcamentos/cotacao'

/**
 * Esta empresa tem a cotação de troca?
 *
 * Uma pergunta, uma resposta, um lugar. A alternativa era cada uma das quatro
 * telas do módulo ler `menu_override` por conta própria — e a que lesse errado
 * mostraria a aba para um tenant que não a tem, sem erro nenhum na tela.
 */
export async function cotacaoDeTrocaLiberada(): Promise<boolean> {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  if (!empresaId) return false
  const { data } = await supabase.from('empresas').select('menu_override').eq('id', empresaId).maybeSingle()
  return temHrefLiberado((data?.menu_override ?? null) as MenuOverrideRow | null, HREF_COTACAO_TROCA)
}
