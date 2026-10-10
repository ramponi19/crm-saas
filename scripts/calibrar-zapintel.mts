/**
 * MEDE O QUE DE FATO SEPARA QUEM COMPROU — para a classificação parar de ser opinião.
 *
 * ══ POR QUE ISTO EXISTE ════════════════════════════════════════════════════
 *
 * `lib/zapintel/classification/engine.ts` são 59 linhas de palavra-chave que
 * alguém (eu) escreveu achando que faziam sentido. Medido em 10/10/2026 contra
 * as vendas de verdade, elas quase não ordenam nada:
 *
 *     customer .... 12,0%     unqualified ..  1,2%
 *     hot .........  2,8%     stalled ......  1,0%
 *     warm ........  0,0%     followup .....  0,2%
 *
 * `warm` converte MENOS que `unqualified`. `followup` converte menos que
 * qualquer coisa. Um rótulo que não ordena é pior que nenhum rótulo, porque
 * manda o vendedor para o lugar errado com ar de certeza.
 *
 * ══ O LIMITE QUE ESTE SCRIPT NÃO PODE ESCONDER ═════════════════════════════
 *
 * São **33 compradores**. Com 33 positivos não se ajusta modelo — se decora.
 * Qualquer regra afinada aqui vai parecer ótima nestes dados e não significar
 * nada nos próximos. Por isso:
 *
 *  · o script mede UMA variável por vez, nunca combinações, para não garimpar;
 *  · exige amostra mínima antes de reportar;
 *  · separa por TEMPO (calibra no que é velho, confere no que é novo), que é o
 *    único jeito honesto de saber se a regra sobrevive fora do que ela viu.
 *
 * O que sai daqui não é "o modelo certo". É uma lista curta de variáveis cuja
 * diferença é grande o bastante para não ser ruído — e só essas entram.
 *
 *     npx tsx scripts/calibrar-zapintel.mts [empresaId]
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { carregarConversas, idDoLead } from '../lib/zapintel/conversas'
import { montarFicha, type Ficha } from '../lib/zapintel/ficha'
import type { Lead } from '../types/zapintel'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const EMPRESA = Number(process.argv[2] ?? 1)
/** Abaixo disto a taxa é anedota, não medida. */
const MINIMO = 40

const { analisados, porId } = await carregarConversas(db, EMPRESA)
const { data: ponte } = await db
  .from('zapintel_venda_lead').select('lead_id')
  .eq('empresa_id', EMPRESA).not('lead_id', 'is', null)
const compradores = new Set((ponte ?? []).map((p) => p.lead_id as number))

/**
 * ⚠ O VAZAMENTO QUE INVALIDARIA TUDO, E QUASE PASSOU.
 *
 * Na primeira medição, "40 ou mais trocas de turno" parecia o melhor preditor
 * de todos: 13,5% contra 1,6% da base, 8,4x. E é circular — quem COMPRA
 * necessariamente conversa muito, porque fechar pedido, combinar pagamento e
 * acertar entrega geram dezenas de mensagens. A variável não antecipa a venda:
 * ela é CONSEQUÊNCIA dela. Um classificador treinado assim acerta brilhante-
 * mente no passado e não serve para nada no lead de amanhã.
 *
 * O conserto é medir a conversa como ela era ANTES de qualquer desfecho: só as
 * mensagens das primeiras 24 h. Vale para todo mundo igual, comprador ou não,
 * então a comparação fica honesta. O que sobreviver a esse corte é sinal; o
 * que sumir era o futuro vazando para dentro do passado.
 */
const JANELA_INICIAL_MS = 86_400_000

function recortarInicio(a: Lead): Lead {
  const msgs = a.messages ?? []
  if (!msgs.length) return a
  const t0 = Date.parse(`${msgs[0].date}T${msgs[0].time || '00:00'}:00`)
  if (Number.isNaN(t0)) return a
  const dentro = msgs.filter((m) => {
    const t = Date.parse(`${m.date}T${m.time || '00:00'}:00`)
    return !Number.isNaN(t) && t - t0 <= JANELA_INICIAL_MS
  })
  return { ...a, messages: dentro }
}

interface Caso { lead: Lead; ficha: Ficha; inicio: Ficha; comprou: boolean }
const casos: Caso[] = []
for (const a of analisados) {
  const id = idDoLead(a)
  const banco = id != null ? porId.get(id) : undefined
  if (!banco) continue
  const comprou = compradores.has(banco.id)
  casos.push({
    lead: a,
    comprou,
    ficha: montarFicha(a, {
      leadId: banco.id, filialId: banco.filial_id, canal: banco.origem ?? 'whatsapp',
      comprou, valorVenda: null, diasAteVenda: null,
    }),
    inicio: montarFicha(recortarInicio(a), {
      leadId: banco.id, filialId: banco.filial_id, canal: banco.origem ?? 'whatsapp',
      comprou, valorVenda: null, diasAteVenda: null,
    }),
  })
}

const base = casos.filter((c) => c.comprou).length / casos.length
console.log(`${casos.length} conversas · ${casos.filter((c) => c.comprou).length} compradores · base ${(base * 100).toFixed(2)}%\n`)

/** Uma variável, fatiada. Imprime taxa por faixa e o quanto cada faixa desvia da base. */
function fatiar(titulo: string, faixas: [string, (c: Caso) => boolean][]) {
  console.log(`\n${titulo}`)
  console.log(`  ${'faixa'.padEnd(26)} ${'leads'.padStart(6)} ${'compraram'.padStart(10)} ${'taxa'.padStart(7)}  x base`)
  for (const [nome, teste] of faixas) {
    const dentro = casos.filter(teste)
    if (dentro.length < MINIMO) {
      console.log(`  ${nome.padEnd(26)} ${String(dentro.length).padStart(6)}  (amostra pequena, ignorar)`)
      continue
    }
    const c = dentro.filter((x) => x.comprou).length
    const taxa = c / dentro.length
    const mult = base > 0 ? taxa / base : 0
    console.log(`  ${nome.padEnd(26)} ${String(dentro.length).padStart(6)} ${String(c).padStart(10)} ${(taxa * 100).toFixed(2).padStart(6)}% ${mult.toFixed(2).padStart(6)}x`)
  }
}

fatiar('INATIVIDADE — o eixo que a classificacao atual ignora', [
  ['ate 2 dias', (c) => c.lead.daysInactive <= 2],
  ['3 a 7 dias', (c) => c.lead.daysInactive > 2 && c.lead.daysInactive <= 7],
  ['8 a 21 dias', (c) => c.lead.daysInactive > 7 && c.lead.daysInactive <= 21],
  ['mais de 21 dias', (c) => c.lead.daysInactive > 21],
])

fatiar('ENGAJAMENTO — quantas mensagens ELE mandou', [
  ['1 ou 2', (c) => c.lead.leadMessages <= 2],
  ['3 a 9', (c) => c.lead.leadMessages >= 3 && c.lead.leadMessages <= 9],
  ['10 a 29', (c) => c.lead.leadMessages >= 10 && c.lead.leadMessages <= 29],
  ['30 ou mais', (c) => c.lead.leadMessages >= 30],
])

fatiar('TROCAS DE TURNO — conversa de verdade vai e volta', [
  ['ate 4', (c) => c.ficha.trocasDeTurno <= 4],
  ['5 a 14', (c) => c.ficha.trocasDeTurno >= 5 && c.ficha.trocasDeTurno <= 14],
  ['15 a 39', (c) => c.ficha.trocasDeTurno >= 15 && c.ficha.trocasDeTurno <= 39],
  ['40 ou mais', (c) => c.ficha.trocasDeTurno >= 40],
])

fatiar('VELOCIDADE DA LOJA — mediana de resposta', [
  ['ate 5 min', (c) => c.ficha.respostaMedianaMin != null && c.ficha.respostaMedianaMin <= 5],
  ['6 a 30 min', (c) => c.ficha.respostaMedianaMin != null && c.ficha.respostaMedianaMin > 5 && c.ficha.respostaMedianaMin <= 30],
  ['31 min a 4h', (c) => c.ficha.respostaMedianaMin != null && c.ficha.respostaMedianaMin > 30 && c.ficha.respostaMedianaMin <= 240],
  ['mais de 4h', (c) => c.ficha.respostaMedianaMin != null && c.ficha.respostaMedianaMin > 240],
])

fatiar('PERGUNTAS DA LOJA', [
  ['nenhuma', (c) => c.ficha.perguntasDaLoja === 0],
  ['1 a 3', (c) => c.ficha.perguntasDaLoja >= 1 && c.ficha.perguntasDaLoja <= 3],
  ['4 a 9', (c) => c.ficha.perguntasDaLoja >= 4 && c.ficha.perguntasDaLoja <= 9],
  ['10 ou mais', (c) => c.ficha.perguntasDaLoja >= 10],
])

fatiar('MONOLOGO DA LOJA — mensagens seguidas sem resposta', [
  ['ate 2', (c) => c.ficha.monologoLoja <= 2],
  ['3 a 5', (c) => c.ficha.monologoLoja >= 3 && c.ficha.monologoLoja <= 5],
  ['6 ou mais', (c) => c.ficha.monologoLoja >= 6],
])

fatiar('QUEM FALOU POR ULTIMO', [
  ['a loja deve resposta', (c) => c.ficha.aguardandoLoja],
  ['a loja falou por ultimo', (c) => !c.ficha.aguardandoLoja],
])

fatiar('CLASSIFICACAO ATUAL — a regua que queremos substituir', [
  ['customer', (c) => c.lead.classification === 'customer'],
  ['hot', (c) => c.lead.classification === 'hot'],
  ['warm', (c) => c.lead.classification === 'warm'],
  ['followup', (c) => c.lead.classification === 'followup'],
  ['stalled', (c) => c.lead.classification === 'stalled'],
  ['unqualified', (c) => c.lead.classification === 'unqualified'],
])

// ── O eixo que falta: quente E recente ──────────────────────────────────────
fatiar('HOT CRUZADO COM RECENCIA (a hipotese)', [
  ['hot e ate 7 dias', (c) => c.lead.classification === 'hot' && c.lead.daysInactive <= 7],
  ['hot e mais de 7 dias', (c) => c.lead.classification === 'hot' && c.lead.daysInactive > 7],
])


// ════════════════════════════════════════════════════════════════════════════
// AS MESMAS VARIAVEIS, SO NAS PRIMEIRAS 24 H — sem o futuro vazando
// ════════════════════════════════════════════════════════════════════════════

fatiar('[24h] TROCAS DE TURNO', [
  ['ate 4', (c) => c.inicio.trocasDeTurno <= 4],
  ['5 a 14', (c) => c.inicio.trocasDeTurno >= 5 && c.inicio.trocasDeTurno <= 14],
  ['15 a 29', (c) => c.inicio.trocasDeTurno >= 15 && c.inicio.trocasDeTurno <= 29],
  ['30 ou mais', (c) => c.inicio.trocasDeTurno >= 30],
])

fatiar('[24h] MENSAGENS DELE', [
  ['1 ou 2', (c) => c.inicio.mensagensLead <= 2],
  ['3 a 9', (c) => c.inicio.mensagensLead >= 3 && c.inicio.mensagensLead <= 9],
  ['10 ou mais', (c) => c.inicio.mensagensLead >= 10],
])

fatiar('[24h] VELOCIDADE DA LOJA', [
  ['ate 5 min', (c) => c.inicio.respostaMedianaMin != null && c.inicio.respostaMedianaMin <= 5],
  ['6 a 30 min', (c) => c.inicio.respostaMedianaMin != null && c.inicio.respostaMedianaMin > 5 && c.inicio.respostaMedianaMin <= 30],
  ['mais de 30 min', (c) => c.inicio.respostaMedianaMin != null && c.inicio.respostaMedianaMin > 30],
  ['a loja nao respondeu', (c) => c.inicio.respostaMedianaMin == null],
])

fatiar('[24h] PERGUNTAS DA LOJA', [
  ['nenhuma', (c) => c.inicio.perguntasDaLoja === 0],
  ['1 a 3', (c) => c.inicio.perguntasDaLoja >= 1 && c.inicio.perguntasDaLoja <= 3],
  ['4 ou mais', (c) => c.inicio.perguntasDaLoja >= 4],
])

fatiar('[24h] O CLIENTE DISSE O QUE QUERIA', [
  ['pediu modelo', (c) => c.inicio.procurou.length > 0],
  ['nao disse modelo', (c) => c.inicio.procurou.length === 0],
])
