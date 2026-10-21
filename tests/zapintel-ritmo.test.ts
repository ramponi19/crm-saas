/**
 * O RESUMO DO ZAPINTEL SOB DEMANDA (21/10/2026).
 *
 * `zapintel_resumo` (o menu: conversas, mensagens, leads por loja) custava
 * ~1,7 s no banco e era refeito a cada aviso do canal — de mensagem, de ficha
 * refeita e de venda. Agora: só com mensagem, no máximo a cada 30 s por aba, e
 * nunca com a aba em segundo plano (nem logo ao voltar, se o teto não passou).
 *
 * Simula o hook com a MESMA regra que ele usa (hooks/zapintel/ritmo.ts): 3 abas
 * por 10 minutos, uma mensagem a cada 15 s (~240/h, o ritmo medido da loja em
 * 14/10), uma ficha refeita por minuto; a aba 3 fica escondida do minuto 2 ao 8.
 * Mede as consultas antes (20 s, todo aviso, volta consulta na hora) e depois.
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INTERVALO_MINIMO, avisoRefaz, esperaDaVolta, esperaDoAviso } from '@/hooks/zapintel/ritmo'

interface Regra { intervalo: number; eventos: string[] | null; voltaRespeitaTeto: boolean }
const ANTES: Regra = { intervalo: INTERVALO_MINIMO, eventos: null, voltaRespeitaTeto: false }
const DEPOIS: Regra = { intervalo: 30_000, eventos: ['mensagens'], voltaRespeitaTeto: true }

const DURACAO = 10 * 60_000
const avisos: { t: number; evento: string }[] = []
for (let t = 7_000; t < DURACAO; t += 15_000) avisos.push({ t, evento: 'mensagens' })
for (let t = 31_000; t < DURACAO; t += 60_000) avisos.push({ t, evento: 'analises' })
avisos.sort((a, b) => a.t - b.t)

/** Uma aba: consulta ao abrir, reage aos avisos pela regra, e não consulta escondida. */
function simularAba(regra: Regra, escondida: [number, number] | null): number[] {
  const consultas: number[] = []
  let ultima = 0
  let timer: number | null = null
  let atrasado = false
  const visivel = (t: number) => !escondida || t < escondida[0] || t >= escondida[1]
  const consultar = (t: number) => { ultima = t; consultas.push(t) }
  consultar(0) // ao abrir
  for (let t = 0; t <= DURACAO; t += 100) {
    if (timer !== null && t >= timer) {
      timer = null
      if (!visivel(t)) atrasado = true
      else consultar(t)
    }
    if (escondida && t === escondida[1] && atrasado) {
      atrasado = false
      if (regra.voltaRespeitaTeto) timer = t + esperaDaVolta(t, ultima, regra.intervalo)
      else consultar(t)
    }
    for (const a of avisos) {
      if (a.t !== t) continue
      if (!avisoRefaz(a.evento, regra.eventos)) continue
      timer = t + esperaDoAviso(t, ultima, regra.intervalo)
    }
  }
  return consultas
}

const ESCONDIDA: [number, number] = [2 * 60_000, 8 * 60_000]
const abas = (r: Regra) => [simularAba(r, null), simularAba(r, null), simularAba(r, ESCONDIDA)]

test('3 abas, 10 minutos: menos consultas ao resumo, nenhuma escondida, nunca 2 em menos de 30 s', () => {
  const antes = abas(ANTES), depois = abas(DEPOIS)
  const total = (x: number[][]) => x.reduce((s, a) => s + a.length, 0)
  console.log(`  resumo em 10 min, 3 abas: antes ${total(antes)} consultas (${antes.map((a) => a.length).join(' + ')}), depois ${total(depois)} (${depois.map((a) => a.length).join(' + ')})`)
  assert.ok(total(depois) < total(antes))
  for (const aba of depois) {
    for (let i = 1; i < aba.length; i++) assert.ok(aba[i] - aba[i - 1] >= 30_000, `intervalo de ${aba[i] - aba[i - 1]} ms`)
  }
  // A aba escondida não consulta entre o minuto 2 e o 8.
  assert.equal(depois[2].filter((t) => t >= ESCONDIDA[0] && t < ESCONDIDA[1]).length, 0)
})

test('ficha refeita e venda não refazem o resumo; mensagem refaz', () => {
  assert.equal(avisoRefaz('analises', ['mensagens']), false)
  assert.equal(avisoRefaz('vendas', ['mensagens']), false)
  assert.equal(avisoRefaz('mensagens', ['mensagens']), true)
  assert.equal(avisoRefaz('analises', null), true) // as outras telas seguem reagindo a tudo
})

test('ao voltar da aba, só consulta quando o teto passou', () => {
  assert.equal(esperaDaVolta(100_000, 90_000, 30_000), 20_000)
  assert.equal(esperaDaVolta(200_000, 90_000, 30_000), 0)
  assert.equal(esperaDoAviso(100_000, 99_000, 30_000), 29_000)
  assert.equal(esperaDoAviso(100_000, 10_000, 30_000), 2500)
})
