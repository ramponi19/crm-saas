/**
 * ⚠ QUEBRADO — NÃO RODAR. TODO(2026-10-17): reescrever ou apagar na reconstrução do ZapIntel.
 *
 * Usa `lead.classification`, `lead.score` e `ficha.sinais`, que saíram dos tipos
 * em 15/10 (o motor de palavras foi removido): as réguas de classe dão zero e as
 * de score ordenam por `undefined`, sem erro nenhum. Fica FORA da checagem de
 * compilação dos scripts (`tsconfig.scripts.json`) até lá; o resto dela pega
 * qualquer script novo que quebrar.
 */
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

// ════════════════════════════════════════════════════════════════════════════
// A REGUA: um score so presta se puser quem comprou no topo
// ════════════════════════════════════════════════════════════════════════════
//
// "O score melhorou" nao e opiniao — e uma medida. A pergunta que importa para
// quem atende e: se eu trabalhar so os N primeiros da lista, quantos dos
// compradores eu pego? Isso se chama RECALL NO TOPO, e e o unico jeito de
// comparar dois scores sem discutir gosto.
//
// Com 33 compradores, o topo de 10% (208 leads) teria 3,3 deles por acaso. Um
// score que nao chega perto disso nao esta ordenando — esta sorteando.

const compradoresTotal = casos.filter((c) => c.comprou).length

function regua(nome: string, pontos: (c: Caso) => number) {
  const ordenado = [...casos].sort((a, b) => pontos(b) - pontos(a))
  const linha = (pct: number) => {
    const n = Math.max(1, Math.round(casos.length * pct))
    const pegou = ordenado.slice(0, n).filter((c) => c.comprou).length
    const acaso = compradoresTotal * pct
    return `    top ${String(Math.round(pct * 100)).padStart(2)}% (${String(n).padStart(4)} leads): `
      + `${String(pegou).padStart(2)} de ${compradoresTotal} compradores `
      + `(${((pegou / compradoresTotal) * 100).toFixed(0).padStart(3)}%) — acaso daria ${acaso.toFixed(1)}`
  }
  console.log(`\n  ${nome}`)
  for (const p of [0.05, 0.1, 0.2, 0.3]) console.log(linha(p))
}

console.log(`\n${'='.repeat(74)}\nQUEM PUXA COMPRADOR PARA O TOPO\n${'='.repeat(74)}`)

regua('score de hoje (lib/zapintel/scoring/leadScore.ts)', (c) => c.lead.score)
regua('so trocas de turno nas primeiras 24 h', (c) => c.inicio.trocasDeTurno)
regua('so mensagens dele nas primeiras 24 h', (c) => c.inicio.mensagensLead)
regua('so perguntas da loja nas primeiras 24 h', (c) => c.inicio.perguntasDaLoja)

// ── O vazamento que sobrou: quem compra no MESMO dia ───────────────────────
//
// "Primeiras 24 h" protege contra o futuro vazando... exceto para quem fecha
// dentro dessas 24 h. E a mediana do ciclo e 2 dias, com p25 em ZERO: muita
// venda acontece no primeiro dia. Para esses, a janela inicial contem a propria
// negociacao — mais mensagens porque comprou, nao antes de comprar.
//
// O teste honesto e refazer a regua so com quem demorou a comprar. Se o sinal
// sobreviver ali, ele PREVE. Se sumir, ele so DETECTA o que ja aconteceu.
const { data: ciclos } = await db
  .from('zapintel_venda_lead').select('lead_id, dias_ate_venda')
  .eq('empresa_id', EMPRESA).not('lead_id', 'is', null)
const diasDoLead = new Map<number, number>()
for (const c of ciclos ?? []) {
  const d = (c.dias_ate_venda as number | null) ?? 999
  const id = c.lead_id as number
  diasDoLead.set(id, Math.min(diasDoLead.get(id) ?? 999, d))
}

const demorados = casos.filter((c) => {
  if (!c.comprou) return true                      // nao-comprador fica
  return (diasDoLead.get(c.ficha.leadId) ?? 999) >= 2   // comprador so se demorou
})
const nDemorados = demorados.filter((c) => c.comprou).length

function reguaEm(lista: Caso[], total: number, nome: string, pontos: (c: Caso) => number) {
  const ordenado = [...lista].sort((a, b) => pontos(b) - pontos(a))
  console.log(`\n  ${nome}`)
  for (const pct of [0.05, 0.1, 0.2, 0.3]) {
    const n = Math.max(1, Math.round(lista.length * pct))
    const pegou = ordenado.slice(0, n).filter((c) => c.comprou).length
    console.log(`    top ${String(Math.round(pct * 100)).padStart(2)}%: ${String(pegou).padStart(2)} de ${total}`
      + ` (${((pegou / total) * 100).toFixed(0).padStart(3)}%) — acaso daria ${(total * pct).toFixed(1)}`)
  }
}

console.log(`\n${'='.repeat(74)}`)
console.log(`SO QUEM DEMOROU 2+ DIAS PARA COMPRAR (${nDemorados} de ${compradoresTotal})`)
console.log(`— aqui a janela de 24 h nao pode conter a venda`)
console.log('='.repeat(74))
reguaEm(demorados, nDemorados, 'score de hoje', (c) => c.lead.score)
reguaEm(demorados, nDemorados, 'mensagens dele nas 1as 24 h', (c) => c.inicio.mensagensLead)
reguaEm(demorados, nDemorados, 'trocas de turno nas 1as 24 h', (c) => c.inicio.trocasDeTurno)

// ── Candidatos a score novo, medidos na base limpa ─────────────────────────
//
// Com 16 compradores "limpos" nao se ajusta peso: se escolhe entre poucas
// formas simples e se mede qual ordena melhor. Mais fator que isso e decorar.
const LIFT: Record<string, number> = {
  'Perguntou sobre entrega': 32,
  'Pediu chave Pix': 20,
  'Pediu NF': 16,
  'Mencionou cartão': 16,
  'Confirmou (Combinado)': 15,
  'Perguntou sobre garantia': 13,
  'Pediu parcelamento': 13,
  'Perguntou IMEI': 12,
}
const bonusDeSinais = (c: Caso) =>
  (c.inicio.sinais ?? []).reduce((s, x) => s + (LIFT[x] ?? 0), 0)

console.log(`\n${'='.repeat(74)}\nCANDIDATOS (base limpa: ${nDemorados} compradores)\n${'='.repeat(74)}`)
reguaEm(demorados, nDemorados, 'A) mensagens dele (24h)', (c) => c.inicio.mensagensLead)
reguaEm(demorados, nDemorados, 'B) mensagens dele + bonus de sinais',
  (c) => c.inicio.mensagensLead * 3 + bonusDeSinais(c))
reguaEm(demorados, nDemorados, 'C) so bonus de sinais', bonusDeSinais)
reguaEm(demorados, nDemorados, 'D) mensagens dele x perguntas da loja',
  (c) => c.inicio.mensagensLead * (1 + Math.min(c.inicio.perguntasDaLoja, 4)))

// ── O VAZAMENTO QUE ESTAVA NO PROPRIO TESTE ────────────────────────────────
//
// `montarFicha(recortarInicio(a))` recorta as MENSAGENS, mas copia
// `a.buySignals`, que o montador calculou sobre a conversa INTEIRA. Entao o
// candidato "mensagens + sinais" estava sendo medido com sinais do futuro — e
// so apareceu porque a implementacao honesta ficou pior que a medicao prometia.
//
// Aqui os sinais sao recalculados a partir do texto das primeiras 24 h.
const SINAIS_KW: [string, string][] = [
  ['entrega', 'Perguntou sobre entrega'], ['pix', 'Pediu chave Pix'],
  ['nf', 'Pediu NF'], ['nota fiscal', 'Pediu NF'], ['cartão', 'Mencionou cartão'],
  ['combinado', 'Confirmou (Combinado)'], ['garantia', 'Perguntou sobre garantia'],
  ['parcel', 'Pediu parcelamento'], ['imei', 'Perguntou IMEI'],
]
function sinaisDeVerdadeNoInicio(c: Caso): string[] {
  const t = (c.lead.messages ?? [])
    .filter((m) => !m.isStore)
    .filter((m) => {
      const t0 = Date.parse(`${c.lead.messages[0]?.date}T${c.lead.messages[0]?.time || '00:00'}:00`)
      const tm = Date.parse(`${m.date}T${m.time || '00:00'}:00`)
      return !Number.isNaN(t0) && !Number.isNaN(tm) && tm - t0 <= 86_400_000
    })
    .map((m) => (m.body || '').toLowerCase()).join(' ')
  return [...new Set(SINAIS_KW.filter(([kw]) => t.includes(kw)).map(([, l]) => l))]
}
const bonusHonesto = (c: Caso) =>
  sinaisDeVerdadeNoInicio(c).reduce((s, x) => s + (LIFT[x] ?? 0), 0)

console.log(`\n${'='.repeat(74)}\nSEM VAZAMENTO NENHUM (base limpa: ${nDemorados})\n${'='.repeat(74)}`)
reguaEm(demorados, nDemorados, 'mensagens dele (24h)', (c) => c.inicio.mensagensLead)
reguaEm(demorados, nDemorados, 'sinais REAIS das 24h', bonusHonesto)
reguaEm(demorados, nDemorados, 'mensagens x3 + sinais REAIS',
  (c) => c.inicio.mensagensLead * 3 + bonusHonesto(c))
reguaEm(demorados, nDemorados, 'score novo, como esta no codigo', (c) => c.lead.score)

// ── O teto destruiu o topo ─────────────────────────────────────────────────
//
// `Math.min(150, bruto)` e depois escala 0-100: todo lead com 50+ mensagens
// vira 100, e o desempate vira sorteio justamente onde a ordem mais importa.
// A alternativa e uma curva que nunca satura de verdade — so se aproxima.
const expo = (msgs: number, k: number) => Math.round(100 * (1 - Math.exp(-msgs / k)))

console.log(`\n${'='.repeat(74)}\nMAPEAR 0-100 SEM DESTRUIR A ORDEM (base limpa: ${nDemorados})\n${'='.repeat(74)}`)
reguaEm(demorados, nDemorados, 'ordem crua (mensagens 24h)', (c) => c.inicio.mensagensLead)
for (const k of [8, 12, 20]) {
  reguaEm(demorados, nDemorados, `curva k=${k}`, (c) => expo(c.inicio.mensagensLead, k))
}

// ── TERCEIRO VAZAMENTO, E O PIOR: `recortarInicio` nao recortava a contagem ─
//
// Ele faz `{ ...a, messages: dentro }` — troca as mensagens, mas `leadMessages`
// continua sendo o numero da conversa INTEIRA, copiado do original. Entao
// `c.inicio.mensagensLead` nunca foi "mensagens nas 24h": era o total. Ou seja,
// a variavel circular que eu tinha rejeitado logo no comeco, de volta por
// descuido, medindo 63% e me convencendo a reescrever o score em cima dela.
//
// Aqui a contagem sai das mensagens recortadas, que e a unica fonte honesta.
function mensagensDeleNoInicio(c: Caso): number {
  const ms = c.lead.messages ?? []
  if (!ms.length) return 0
  const t0 = Date.parse(`${ms[0].date}T${ms[0].time || '00:00'}:00`)
  if (Number.isNaN(t0)) return 0
  return ms.filter((m) => {
    if (m.isStore) return false
    const t = Date.parse(`${m.date}T${m.time || '00:00'}:00`)
    return !Number.isNaN(t) && t - t0 <= 86_400_000
  }).length
}

console.log(`\n${'='.repeat(74)}\nDE VERDADE AGORA (base limpa: ${nDemorados})\n${'='.repeat(74)}`)
reguaEm(demorados, nDemorados, 'mensagens dele nas 24h — contagem REAL', mensagensDeleNoInicio)
reguaEm(demorados, nDemorados, 'o que o harness media (conversa inteira)', (c) => c.inicio.mensagensLead)
reguaEm(demorados, nDemorados, 'score antigo, para comparar', (c) => c.lead.score)
reguaEm(demorados, nDemorados, 'sinais REAIS das 24h', bonusHonesto)
reguaEm(demorados, nDemorados, 'mensagens REAIS x3 + sinais REAIS',
  (c) => mensagensDeleNoInicio(c) * 3 + bonusHonesto(c))
