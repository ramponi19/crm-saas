import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { marcaDoCache, ultimaMensagemDoBanco } from '@/lib/zapintel/cache'

/**
 * "CHEGOU MENSAGEM NOVA, E O SERVIDOR JÁ CONTOU?" — DUAS LINHAS, SEM PAINEL.
 *
 * ══ POR QUE NÃO É UMA ASSINATURA DE TEMPO REAL ═════════════════════════════
 *
 * Era, e estava errado. O canal do Supabase roda no NAVEGADOR, sob o RLS do
 * usuário: `filiais_visiveis() @> filial`, que para dono e admin devolve só a
 * loja selecionada no CRM. O painel do ZapIntel, ao contrário, é calculado no
 * servidor e mostra a REDE inteira.
 *
 * O resultado media exatamente o tamanho do engano: em 09/10/2026, com a conta
 * parada em Jaguariúna, chegaram 100 mensagens em Mogi e 1 em Jaguariúna em 45
 * minutos. A tela mostrava as duas lojas e não reagia a 99% do movimento — e o
 * canal dizia "SUBSCRIBED", porque entrar no canal e estar autorizado a receber
 * linha são coisas diferentes. Silêncio parecia calmaria.
 *
 * O pulso olha com os mesmos olhos do painel: mesmo escopo, mesma empresa.
 *
 * ══ POR QUE O ID, E NÃO A CONTAGEM ═════════════════════════════════════════
 *
 * `count` exato custa 1,7 s nesta tabela (medido) — mais que a leitura inteira
 * do painel. E cairia se uma mensagem fosse apagada, fazendo um painel velho
 * parecer em dia. O maior id só anda para frente, e sai pelo índice da chave
 * primária em milissegundos.
 *
 * ══ POR QUE DEVOLVE TAMBÉM O CARIMBO DO CACHE ══════════════════════════════
 *
 * Porque desde 09/10/2026 quem decide recalcular é o servidor, e a tela precisa
 * saber de duas coisas diferentes:
 *
 *   `ultima` > `analisadoAte` ........ chegou mensagem que ainda não foi contada
 *   `analisadoAte` > o que está na tela ... o servidor já recalculou; é só pegar
 *
 * Sem o segundo número a tela ficaria pedindo o painel de minuto em minuto para
 * descobrir que nada mudou. Com ele, ela pede uma vez, na hora certa — e o
 * `proximoEm` diz que hora é essa. **Nunca** lê a coluna `painel`: seriam
 * 1,75 MB a cada batida.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const { empresaId } = await zapintelEmpresa()
  const db = rastrDb()

  try {
    const [ultima, marca] = await Promise.all([
      ultimaMensagemDoBanco(db, empresaId),
      marcaDoCache(db, empresaId),
    ])

    return NextResponse.json({
      ultima,
      analisadoAte: marca?.ultimaMensagem ?? 0,
      calculadoEm: marca?.calculadoEm ?? null,
      // Epoch ms. Sem cache nenhum, agora: a primeira carga não espera janela.
      proximoEm: marca?.proximoEm ?? Date.now(),
    })
  } catch (e) {
    console.error('zapintel/pulso:', (e as Error).message)
    return NextResponse.json({ erro: 'falha ao consultar' }, { status: 500 })
  }
}
