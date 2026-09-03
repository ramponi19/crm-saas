import { Topbar } from '@/components/layout/topbar'
import { cotacaoDeTrocaLiberada } from '@/lib/troca-acesso'
import { AbasOrcamentos } from './abas'

/**
 * A casca de Orçamentos: barra de topo + abas, uma vez para as quatro telas.
 *
 * ══ POR QUE UM LAYOUT, E NÃO ABAS DENTRO DE UMA PÁGINA ═════════════════════
 *
 * As abas são ROTAS de verdade (`/orcamentos`, `/orcamentos/cotacao`,
 * `/orcamentos/precos`, `/orcamentos/checklist`), não estado de componente.
 * Duas razões práticas:
 *
 *  · a matriz de preços tem 140 linhas e o checklist tem 26 itens. Como estado,
 *    as três telas carregariam juntas a cada abertura de Orçamentos — inclusive
 *    para quem só queria ver a lista;
 *  · o vendedor no balcão manda o link da aba pro colega. Aba como estado não
 *    tem endereço.
 *
 * ══ E O GATE MORA AQUI ═════════════════════════════════════════════════════
 *
 * A liberação por empresa é decidida em UM lugar. Repetida nas quatro páginas,
 * a que ficasse desatualizada mostraria a aba para um tenant que não tem o
 * módulo — e o erro apareceria como tela em branco, não como falha.
 */
export default async function OrcamentosLayout({ children }: { children: React.ReactNode }) {
  const cotacao = await cotacaoDeTrocaLiberada()

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Orçamentos" />
      {/* Sem a cotação liberada, não há o que escolher: uma faixa de abas com
          uma aba só é ruído. A tela fica como sempre foi. */}
      {cotacao && (
        <div className="shrink-0 px-4 sm:px-6">
          <AbasOrcamentos />
        </div>
      )}
      {children}
    </div>
  )
}
