import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { carregarConversas } from '@/lib/zapintel/conversas'

/**
 * UMA conversa, inteira, sob demanda.
 *
 * O painel manda os leads sem o texto das conversas — é o que permite analisar
 * as 54 mil mensagens sem estourar o tamanho da resposta. Quem precisa ler uma
 * conversa de verdade (a tela do lead, o copiloto) pede aqui, e recebe só
 * aquela: dezenas de mensagens em vez de dezenas de milhares.
 *
 * Passa pelo MESMO caminho de cálculo do painel, então o lead que volta daqui
 * tem a mesma classificação e o mesmo score que a lista mostrava. Dois
 * caminhos dariam dois números para o mesmo lead.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { empresaId } = await zapintelEmpresa()
  const id = Number(new URL(req.url).searchParams.get('lead'))
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erro: 'lead invalido' }, { status: 400 })
  }

  try {
    // A empresa vem da sessão, não da URL: pedir a conversa de um lead de outra
    // empresa não encontra nada, porque a busca é feita dentro da sua.
    const { analisados } = await carregarConversas(rastrDb(), empresaId, [id])
    const lead = analisados[0]
    if (!lead) return NextResponse.json({ erro: 'conversa nao encontrada' }, { status: 404 })
    return NextResponse.json({ lead })
  } catch (e) {
    console.error('zapintel/conversa:', (e as Error).message)
    return NextResponse.json({ erro: 'falha ao ler a conversa' }, { status: 500 })
  }
}
