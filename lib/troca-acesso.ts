import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { temHrefLiberado, HREF_COTACAO_TROCA } from '@/lib/menu'
import { camadasDoMenu } from '@/lib/empresa-config'

/**
 * Reexportado para as telas de servidor que só falam com este módulo.
 *
 * A constante mora em `lib/menu.ts` porque componente de CLIENTE (o painel de
 * orçamentos do lead) também precisa dela, e este arquivo importa
 * `lib/supabase/server` — que não atravessa a fronteira do cliente.
 */
export { HREF_COTACAO_TROCA }

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
  // A camada do superadmin mora em empresa_menu.itens.superadmin desde 21/10/2026.
  const { data } = await supabase.from('empresa_menu').select('itens').eq('empresa_id', empresaId).maybeSingle()
  return temHrefLiberado(camadasDoMenu(data?.itens).superadmin, HREF_COTACAO_TROCA)
}
