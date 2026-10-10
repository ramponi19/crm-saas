import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { montarPainel } from '@/lib/zapintel/painel'
import { cacheServe, guardarPainel, painelDoCache } from '@/lib/zapintel/cache'

/**
 * O PAINEL INTEIRO, NUMA CHAMADA — E SÓ CALCULA SE PEDIREM.
 *
 * Substituiu `/zapintel/api/conversas`, que mandava as conversas em CSV para o
 * navegador analisar. Aquilo tinha teto — 4,5 MB de resposta — e o teto foi
 * pago com truncamento: a análise parava três semanas atrás e ninguém via.
 *
 * ══ O QUE MUDOU EM 09/10/2026, NO MESMO DIA ════════════════════════════════
 *
 * A primeira versão calculava ao vivo a cada abertura. Funcionava e era honesta
 * no número, mas custava **2,76 s de Active CPU por abertura** — e a Vercel
 * mandou aviso de 75% do teto de 4 h/mês do plano free no fim da tarde. O teto
 * não cobra a mais: ele **pausa os projetos**.
 *
 * Agora o resultado mora em `zapintel_painel` e esta rota quase sempre só
 * repassa o texto guardado — sem `JSON.parse`, sem `JSON.stringify`. Medido:
 * 7.230 ms de cálculo contra 293 ms de leitura.
 *
 * `?forcar=1` é o único caminho que calcula, e ele só sai do botão
 * "Sincronizar agora". Não há relógio nenhum chamando esta rota: abrir a tela
 * mostra o que está guardado, e a tela diz de quando é. Ver
 * `lib/zapintel/cache.ts` para o porquê de não haver automático.
 *
 * ══ POR QUE NÃO GRAVA `zapintel_analise` ═══════════════════════════════════
 *
 * Seria natural aproveitar o cálculo. Mas seriam 2.200 upserts por recálculo,
 * numa tabela que nenhuma tela lê hoje. Quem a mantém é
 * `/zapintel/api/recalcular`, pelo mesmo caminho de cálculo.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { empresaId } = await zapintelEmpresa()
  const db = rastrDb()
  const forcar = new URL(req.url).searchParams.get('forcar') === '1'

  try {
    const cache = await painelDoCache(db, empresaId)

    if (cache && cacheServe(cache.marca, forcar)) {
      // O texto sai como veio do banco. Transformar em objeto para devolver
      // objeto custaria as duas pontas da serialização, e ninguém aqui precisa
      // olhar dentro dele.
      return new NextResponse(cache.texto, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          // Para quem for investigar custo depois: diz se esta resposta custou
          // um cálculo ou uma leitura, sem precisar instrumentar no escuro.
          'x-zapintel-cache': 'hit',
        },
      })
    }

    const { painel } = await montarPainel(db, empresaId)
    const texto = JSON.stringify(painel)
    await guardarPainel(db, empresaId, texto, painel.ultimaMensagem, painel.mensagens, painel.ms)

    return new NextResponse(texto, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-zapintel-cache': 'miss',
      },
    })
  } catch (e) {
    console.error('zapintel/painel:', (e as Error).message)
    return NextResponse.json({ erro: 'falha ao montar o painel' }, { status: 500 })
  }
}
