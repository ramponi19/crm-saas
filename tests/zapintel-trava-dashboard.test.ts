/**
 * A TRAVA DO DASHBOARD DO ZAPINTEL (10/11/2026, pedido do Lucas).
 *
 * Simula 30 minutos de pico (uma mensagem a cada 12 s — ~295/h às 11h, medido
 * em 09/11 —, uma ficha refeita por minuto, uma venda a cada 10 min) com várias
 * abas do dashboard abertas no mesmo navegador, e mede no banco: quantos
 * dashboards, quantos AO MESMO TEMPO, e se alguma aba escondida consultou.
 * Cada consulta dura 1,2 s (o dashboard sozinho em produção, 09/11).
 *
 *   ANTES  = a regra que está em produção: todo aviso, teto de 20 s por aba,
 *            respiro fixo de 2,5 s, cada aba por si, carga inicial mesmo escondida.
 *   DEPOIS = TRAVA_DO_DASHBOARD: só mensagem, 60 s, sorteio 0–5 s somado ao teto,
 *            nunca escondida (nem na carga inicial), abas partilhando a consulta.
 *
 * As regras são as MESMAS funções que o hook usa (hooks/zapintel/ritmo.ts).
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INTERVALO_MINIMO, TRAVA_DO_DASHBOARD, avisoRefaz, decidirDisparo, esperaComSorteio, esperaDaVolta, esperaDoAviso, sorteioEntre,
} from '@/hooks/zapintel/ritmo'

const DURACAO = 30 * 60_000
const CONSULTA = 1_200
const PASSO = 100

const avisos: { t: number; evento: string }[] = []
for (let t = 5_000; t < DURACAO; t += 12_000) avisos.push({ t, evento: 'mensagens' })
for (let t = 31_000; t < DURACAO; t += 60_000) avisos.push({ t, evento: 'analises' })
for (let t = 200_000; t < DURACAO; t += 600_000) avisos.push({ t, evento: 'vendas' })

/** Gerador determinístico (mulberry32): o sorteio do teste é sempre o mesmo. */
function semente(s: number) {
  return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

interface Aba { abre: number; escondida: [number, number] | null }
const ABAS: Aba[] = [
  { abre: 0, escondida: null },
  { abre: 3_000, escondida: null },
  { abre: 40_000, escondida: null },
  { abre: 90_000, escondida: null },
  { abre: 6_000, escondida: [5 * 60_000, 25 * 60_000] },
  { abre: 10 * 60_000, escondida: [10 * 60_000, 15 * 60_000] }, // aberta em segundo plano (ctrl+clique)
]

interface Consulta { aba: number; t: number; abertura: boolean }

function simular(trava: boolean): Consulta[] {
  const o = TRAVA_DO_DASHBOARD
  const intervalo = trava ? o.intervaloMinimo! : INTERVALO_MINIMO
  const eventos = trava ? o.eventos! : null
  const aleatorio = semente(42)
  const consultas: Consulta[] = []
  const entregas: { t: number; em: number }[] = []
  const st = ABAS.map(() => ({ aberta: false, carregou: false, esperandoVisivel: false, ultima: 0, aviso: 0, timer: null as number | null, atrasado: false }))
  const visivel = (i: number, t: number) => { const e = ABAS[i].escondida; return !e || t < e[0] || t >= e[1] }

  const consultar = (i: number, t: number, abertura: boolean) => {
    consultas.push({ aba: i, t, abertura })
    st[i].ultima = t
    if (trava) { // "inicio" chega às irmãs na hora; os dados, quando a consulta termina
      st.forEach((s, j) => { if (j !== i && s.aberta) s.ultima = Math.max(s.ultima, t) })
      entregas.push({ t: t + CONSULTA, em: t })
    }
    st[i].carregou = true
  }
  const buscar = (i: number, t: number) => { if (!visivel(i, t)) { st[i].atrasado = true; return } st[i].atrasado = false; consultar(i, t, false) }

  for (let t = 0; t <= DURACAO; t += PASSO) {
    // dados partilhados chegando
    for (const e of entregas.filter((x) => x.t === t)) {
      st.forEach((s) => { if (s.aberta) { s.carregou = true; if (e.em >= s.aviso) s.atrasado = false } })
    }
    ABAS.forEach((aba, i) => {
      const s = st[i]
      // abrir a aba
      if (t === aba.abre) {
        s.aberta = true
        if (trava && !visivel(i, t)) s.esperandoVisivel = true
        else consultar(i, t, true)
      }
      if (!s.aberta) return
      // ficou visível
      if (aba.escondida && t === aba.escondida[1]) {
        if (s.esperandoVisivel) {
          s.esperandoVisivel = false
          const fresco = s.carregou && t - s.ultima < intervalo
          if (!fresco) consultar(i, t, true)
        } else if (s.atrasado) {
          s.timer = t + esperaDaVolta(t, s.ultima, intervalo)
        }
      }
      // timer
      if (s.timer !== null && t >= s.timer) {
        s.timer = null
        if (!trava) buscar(i, t)
        else {
          const d = decidirDisparo(t, s.ultima, s.aviso, intervalo)
          if (d === 'consultar') buscar(i, t)
          else if (d === 'esperar') s.timer = t + esperaComSorteio(t, s.ultima, intervalo, sorteioEntre(o.sorteio![0], o.sorteio![1], aleatorio))
        }
      }
      // avisos do banco (a mesma hora em todas as abas)
      for (const a of avisos) {
        if (a.t !== t || !avisoRefaz(a.evento, eventos)) continue
        if (!trava) { s.timer = t + esperaDoAviso(t, s.ultima, intervalo); continue }
        s.aviso = t
        s.timer = t + esperaComSorteio(t, s.ultima, intervalo, sorteioEntre(o.sorteio![0], o.sorteio![1], aleatorio))
      }
    })
  }
  return consultas
}

/** Quantas consultas no máximo rodando ao mesmo tempo no banco. */
function simultaneas(c: Consulta[]): number {
  const pontos = c.flatMap((x) => [[x.t, 1], [x.t + CONSULTA, -1]] as [number, number][]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let agora = 0, max = 0
  for (const [, d] of pontos) { agora += d; max = Math.max(max, agora) }
  return max
}

const antes = simular(false)
const depois = simular(true)

test('6 abas, 30 min de pico: menos dashboards e nunca dois ao mesmo tempo', () => {
  const semAbertura = (c: Consulta[]) => c.filter((x) => !x.abertura)
  console.log(`  dashboards em 30 min, 6 abas: antes ${antes.length} (até ${simultaneas(semAbertura(antes))} ao mesmo tempo), depois ${depois.length} (até ${simultaneas(semAbertura(depois))} ao mesmo tempo); aberturas: ${antes.filter((x) => x.abertura).length} × ${depois.filter((x) => x.abertura).length}`)
  assert.ok(depois.length * 4 < antes.length, `${depois.length} × ${antes.length}`)
  assert.ok(simultaneas(semAbertura(antes)) >= 4, 'a regra de hoje dispara as abas juntas')
  assert.equal(simultaneas(semAbertura(depois)), 1)
  assert.equal(simultaneas(depois), 1)
})

test('fora das aberturas, o navegador inteiro faz no máximo 1 dashboard a cada 60 s', () => {
  const recalculos = depois.filter((c) => !c.abertura).map((c) => c.t).sort((a, b) => a - b)
  assert.ok(recalculos.length > 10)
  for (let i = 1; i < recalculos.length; i++) assert.ok(recalculos[i] - recalculos[i - 1] >= 60_000, `${recalculos[i] - recalculos[i - 1]} ms`)
})

test('aba escondida não consulta — nem a aberta em segundo plano, que carrega só ao aparecer', () => {
  for (const [i, aba] of ABAS.entries()) {
    if (!aba.escondida) continue
    const dentro = depois.filter((c) => c.aba === i && c.t >= aba.escondida![0] && c.t < aba.escondida![1])
    assert.equal(dentro.length, 0, `aba ${i}: ${dentro.map((c) => c.t).join(', ')}`)
  }
  // Hoje a aba aberta em segundo plano carrega na hora, escondida.
  assert.ok(antes.some((c) => c.aba === 5 && c.t === 10 * 60_000))
})

test('ficha refeita e venda não refazem o dashboard; mensagem refaz', () => {
  assert.deepEqual(TRAVA_DO_DASHBOARD.eventos, ['mensagens'])
  assert.equal(avisoRefaz('analises', TRAVA_DO_DASHBOARD.eventos!), false)
  assert.equal(avisoRefaz('vendas', TRAVA_DO_DASHBOARD.eventos!), false)
  assert.equal(avisoRefaz('mensagens', TRAVA_DO_DASHBOARD.eventos!), true)
})

test('regras puras: sorteio somado ao teto e a decisão no disparo', () => {
  assert.equal(esperaComSorteio(100_000, 90_000, 60_000, 3_000), 53_000) // faltam 50 s do teto + 3 s
  assert.equal(esperaComSorteio(200_000, 90_000, 60_000, 3_000), 3_000)  // teto passou: só o sorteio
  assert.equal(sorteioEntre(0, 5_000, () => 0), 0)
  assert.equal(sorteioEntre(0, 5_000, () => 0.999999), 5_000)
  assert.equal(decidirDisparo(200_000, 150_000, 140_000, 60_000), 'nada')      // irmã consultou depois do aviso
  assert.equal(decidirDisparo(200_000, 150_000, 160_000, 60_000), 'esperar')   // aviso novo, teto não passou
  assert.equal(decidirDisparo(220_000, 150_000, 160_000, 60_000), 'consultar')
})
