import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { carregarConversas } from '@/lib/zapintel/conversas'
import { montarFicha } from '@/lib/zapintel/ficha'

/**
 * UMA conversa, inteira, mais a FICHA dela.
 *
 * O painel manda os leads sem o texto das conversas — é o que permite analisar
 * as 55 mil mensagens sem estourar o tamanho da resposta. Quem precisa ler uma
 * conversa de verdade (a tela do lead, o copiloto) pede aqui, e recebe só
 * aquela: dezenas de mensagens em vez de dezenas de milhares.
 *
 * Passa pelo MESMO caminho de cálculo do painel, então o lead que volta daqui
 * tem a mesma classificação e o mesmo score que a lista mostrava. Dois
 * caminhos dariam dois números para o mesmo lead.
 *
 * ══ POR QUE A FICHA VEM JUNTO ══════════════════════════════════════════════
 *
 * Porque ela é barata exatamente aqui: a conversa já está carregada e
 * analisada, e montar a ficha custa percorrer as mensagens mais uma vez —
 * milissegundos. Guardá-la numa tabela só faria sentido para o passo seguinte,
 * em que os AGREGADOS passam a sair das fichas em vez das 55 mil mensagens.
 * Enquanto esse passo não existe, tabela seria armazenamento sem leitor.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { empresaId } = await zapintelEmpresa()
  const id = Number(new URL(req.url).searchParams.get('lead'))
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erro: 'lead invalido' }, { status: 400 })
  }

  try {
    const db = rastrDb()
    // A empresa vem da sessão, não da URL: pedir a conversa de um lead de outra
    // empresa não encontra nada, porque a busca é feita dentro da sua.
    const { analisados, porId } = await carregarConversas(db, empresaId, [id])
    const lead = analisados[0]
    const banco = porId.get(id)
    if (!lead || !banco) return NextResponse.json({ erro: 'conversa nao encontrada' }, { status: 404 })

    // Comprou? Vem da ponte, não de palavra na conversa — é a diferença entre
    // a ficha afirmar e a ficha adivinhar.
    const { data: ponte } = await db
      .from('zapintel_venda_lead')
      .select('venda_id, dias_ate_venda')
      .eq('empresa_id', empresaId).eq('lead_id', id)
      .order('dias_ate_venda', { ascending: true })
      .limit(1).maybeSingle()

    let valorVenda: number | null = null
    if (ponte?.venda_id) {
      const { data: venda } = await db
        .from('vendas').select('valor_venda').eq('id', ponte.venda_id).maybeSingle()
      valorVenda = venda?.valor_venda != null ? Number(venda.valor_venda) : null
    }

    const ficha = montarFicha(lead, {
      leadId: id,
      filialId: banco.filial_id,
      canal: banco.origem ?? 'whatsapp',
      comprou: !!ponte,
      valorVenda,
      diasAteVenda: (ponte?.dias_ate_venda as number | null) ?? null,
    })

    return NextResponse.json({ lead, ficha })
  } catch (e) {
    console.error('zapintel/conversa:', (e as Error).message)
    return NextResponse.json({ erro: 'falha ao ler a conversa' }, { status: 500 })
  }
}
