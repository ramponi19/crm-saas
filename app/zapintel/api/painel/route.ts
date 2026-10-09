import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { montarPainel } from '@/lib/zapintel/painel'

/**
 * O PAINEL INTEIRO, NUMA CHAMADA.
 *
 * Substitui `/zapintel/api/conversas`, que mandava as conversas em CSV para o
 * navegador analisar. Aquilo tinha teto — 4,5 MB de resposta — e o teto foi
 * pago com truncamento: a análise parava três semanas atrás e ninguém via.
 *
 * Aqui as 54.898 mensagens são lidas e analisadas (3,4 s a 4,4 s medidos, de um
 * teto de 10 s) e então descartadas. O que sai é o resultado: 1,75 MB de
 * agregados por loja e um lead leve por conversa.
 *
 * ══ POR QUE NÃO GRAVA ══════════════════════════════════════════════════════
 *
 * Seria natural aproveitar o cálculo e atualizar `zapintel_analise` aqui. Mas
 * isso faria 2.200 upserts a cada vez que alguém ABRE a tela, por uma tabela
 * que ninguém leu nesse meio tempo. Quem mantém a tabela é
 * `/zapintel/api/recalcular`, chamado quando chega mensagem: um lead por vez,
 * pelo mesmo caminho de cálculo, que é o que garante o mesmo resultado.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const { empresaId } = await zapintelEmpresa()
  const db = rastrDb()

  try {
    const { painel } = await montarPainel(db, empresaId)
    return NextResponse.json(painel)
  } catch (e) {
    console.error('zapintel/painel:', (e as Error).message)
    return NextResponse.json({ erro: 'falha ao montar o painel' }, { status: 500 })
  }
}
