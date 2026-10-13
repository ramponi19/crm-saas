import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { painelDoCache, relatoDoCache, guardarRelato } from '@/lib/zapintel/cache'
import { briefingDoDia, systemDoDia } from '@/lib/zapintel/dia'
import { getRole, getSegment } from '@/lib/zapintel/segments/segments'
import { perguntarIA } from '@/lib/zapintel/ia'
import type { Painel } from '@/lib/zapintel/painel'

/**
 * O PARÁGRAFO DO DIA.
 *
 * ══ POR QUE É UMA ROTA SEPARADA, E NÃO PARTE DO PAINEL ═════════════════════
 *
 * Porque o painel precisa chegar RÁPIDO e esta chamada depende de um provedor
 * de fora. Costurar as duas faria a tela inteira esperar o Gemini — e, nos
 * dias em que ele estivesse fora do ar, o CRM pareceria quebrado por causa de
 * um parágrafo.
 *
 * Separada, a tela desenha o painel na hora e o texto chega quando chegar. Se
 * não chegar, não aparece, e nada mais sofre.
 *
 * ══ A CONTA QUE ESTA ROTA EXISTE PARA NÃO PAGAR ════════════════════════════
 *
 * Uma chamada de IA por abertura de tela seria o mesmo erro do pulso de 20 s
 * que custou 44% do CPU do projeto: barato por unidade, caro por repetição. O
 * texto é guardado e só refeito quando o painel muda — o que, desde 10/10,
 * só acontece quando alguém clica em "Sincronizar agora".
 *
 * Comparar a marca é de graça: `ultima_mensagem` e `relato_marca` são colunas,
 * então o caminho normal responde sem nem olhar o JSON do painel. Só quem vai
 * escrever o texto paga o `JSON.parse`.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const { empresaId } = await zapintelEmpresa()
  const db = rastrDb()

  try {
    const cache = await painelDoCache(db, empresaId)
    // Sem painel não há o que narrar. A tela nem pede nesse caso, mas pedir
    // direto na URL não pode derrubar nada.
    if (!cache) return NextResponse.json({ relato: null })

    const guardado = await relatoDoCache(db, empresaId)
    if (guardado && guardado.marca === cache.marca.ultimaMensagem) {
      return NextResponse.json(
        { relato: guardado.texto, em: guardado.em },
        { headers: { 'x-zapintel-relato': 'hit' } },
      )
    }

    const painel = JSON.parse(cache.texto) as Painel
    const briefing = briefingDoDia(painel)
    if (!briefing) return NextResponse.json({ relato: null })

    const seg = getSegment(painel.segmentId)
    const r = await perguntarIA({
      empresaId,
      system: systemDoDia(getRole(painel.segmentId), seg.description),
      mensagens: [{ role: 'user', content: `Os números de hoje:\n\n${briefing}` }],
      // Sem teto apertado: o pensamento do modelo sai deste mesmo saldo, e
      // 400 tokens devolveram meia frase em inglês para a tela do Lucas. Quem
      // segura o tamanho é a regra das 4 frases no `system`, que o modelo
      // obedece. Ver o cabeçalho de `lib/zapintel/ia.ts`.
      origem: 'dia',
    })

    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })

    await guardarRelato(db, empresaId, r.texto, cache.marca.ultimaMensagem)
    return NextResponse.json(
      { relato: r.texto, em: new Date().toISOString() },
      { headers: { 'x-zapintel-relato': 'miss' } },
    )
  } catch (e) {
    console.error('zapintel/dia:', (e as Error).message)
    return NextResponse.json({ erro: 'falha ao escrever o resumo' }, { status: 500 })
  }
}
