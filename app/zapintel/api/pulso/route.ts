import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'

/**
 * "CHEGOU MENSAGEM NOVA?" — UMA LINHA, PARA A TELA SABER SE RECALCULA.
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
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const { empresaId } = await zapintelEmpresa()

  const { data, error } = await rastrDb()
    .from('lead_mensagens')
    .select('id')
    .eq('empresa_id', empresaId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('zapintel/pulso:', error.message)
    return NextResponse.json({ erro: 'falha ao consultar' }, { status: 500 })
  }

  return NextResponse.json({ ultima: (data?.id as number | undefined) ?? 0 })
}
