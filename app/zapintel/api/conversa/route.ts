import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { carregarConversas } from '@/lib/zapintel/conversas'
import { montarFicha } from '@/lib/zapintel/ficha'
import { ondeTravou } from '@/lib/zapintel/travou'
import { lerPerfil, marcaDaConversa } from '@/lib/zapintel/perfil'

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

    // Onde a conversa travou, pelo INDICE da mensagem — para a tela marcar o
    // ponto em vez de obrigar a rolar 41 mensagens procurando. Nao marca nada
    // em conversa que virou venda. Ver `lib/zapintel/travou.ts`.
    const travou = ondeTravou(lead, !!ponte)

    /**
     * A FICHA DE IA VEM JUNTO — SE JÁ EXISTIR. Esta rota nunca gera.
     *
     * A tela do lead precisa abrir na hora. Gerar aqui faria toda primeira
     * abertura esperar 8 segundos por um modelo, e seria pior ainda: a mesma
     * espera voltaria em cada lead que alguém abrisse só para dar uma olhada.
     *
     * Então o que está guardado vem junto de graça (uma consulta por chave
     * primária), com `atual` dizendo se foi escrito para a conversa como ela
     * está agora. Quem decide pedir uma nova é a tela, chamando
     * `/zapintel/api/perfil` — e enquanto a nova não chega, a antiga fica à
     * vista, marcada como desatualizada, em vez de a tela ficar vazia.
     */
    const perfil = await lerPerfil(db, empresaId, id, marcaDaConversa(lead))

    /**
     * A IA ESTÁ LIGADA? A TELA PRECISA SABER ANTES DE PEDIR.
     *
     * Sem isto, abrir qualquer um dos 1.793 leads que ainda não têm ficha
     * dispararia uma chamada a `/zapintel/api/perfil` que já nasce morta — e
     * o vendedor veria "A IA ainda não foi configurada neste CRM" num aviso
     * amarelo em todo lead que abrisse.
     *
     * Pior que o aviso é a conta: cada disparo acorda uma função na Vercel,
     * e o teto de Active CPU do plano free já está em 80%. Pagar CPU para
     * descobrir, lead a lead, uma coisa que o servidor sabia de antemão é
     * exatamente o tipo de desperdício que o matcher do `proxy.ts` passou a
     * semana removendo.
     *
     * São as duas mesmas condições que `perguntarIA` checa — a chave e a
     * chave-geral do superadmin. Checá-las aqui custa a consulta que já
     * aconteceria de qualquer jeito, uma vez, em vez de uma função inteira.
     */
    const { data: cfg } = await db
      .from('assistente_config').select('ativo').eq('id', 1).maybeSingle()
    const iaDisponivel = !!process.env.GEMINI_API_KEY && cfg?.ativo !== false

    return NextResponse.json({ lead, ficha, travou, perfil, iaDisponivel })
  } catch (e) {
    console.error('zapintel/conversa:', (e as Error).message)
    return NextResponse.json({ erro: 'falha ao ler a conversa' }, { status: 500 })
  }
}
