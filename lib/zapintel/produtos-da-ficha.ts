import type { SupabaseClient } from '@supabase/supabase-js'
import { moduloEstaLigado } from '@/lib/modulo-ligado'
import { modelosDoCatalogo, PRODUTOS_GENERICOS, type ProdutosDaFicha } from '@/lib/zapintel/ficha'
import { MODELOS_CELULAR, PALAVRAS_DE_TROCA_CELULAR, ROTULO_TROCA_CELULAR } from '@/components/modules/celulares/zapintel-modelos'

/**
 * O QUE A FICHA PROCURA NA FALA DO CLIENTE, PARA ESTA EMPRESA (17/11/2026).
 *
 *   catálogo   os nomes de `estoque_produtos` (ativos), com o Estoque ligado;
 *   celular    com o módulo de celular (Check IMEI) ligado, o dicionário dele vem
 *              ANTES do catálogo — é o que a ficha usava até aqui para todo mundo —,
 *              e o jeito de falar da troca da loja de celular.
 *
 * Sem nenhum dos dois, a ficha fica com o genérico: não procura modelo, e a troca é
 * "com usado na troca". Não muda conta nenhuma do ZapIntel: `procurou` é texto da ficha.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function produtosDaFicha(db: SupabaseClient<any>, empresaId: number): Promise<ProdutosDaFicha> {
  const [celular, comEstoque] = await Promise.all([
    moduloEstaLigado(empresaId, 'check_imei'),
    moduloEstaLigado(empresaId, 'estoque'),
  ])
  let catalogo: [string, string][] = []
  if (comEstoque) {
    const { data } = await db.from('estoque_produtos').select('nome')
      .eq('empresa_id', empresaId).eq('ativo', true).limit(1000)
    catalogo = modelosDoCatalogo(((data ?? []) as { nome: string | null }[]).map((p) => p.nome))
  }
  if (!celular) return { ...PRODUTOS_GENERICOS, modelos: catalogo }
  return {
    modelos: [...MODELOS_CELULAR, ...catalogo],
    palavrasDeTroca: [...PRODUTOS_GENERICOS.palavrasDeTroca, ...PALAVRAS_DE_TROCA_CELULAR],
    rotuloTroca: ROTULO_TROCA_CELULAR,
  }
}
