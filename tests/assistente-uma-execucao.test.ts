/**
 * O ASSISTENTE NUMA EXECUÇÃO SÓ (10/11/2026, pedido do Lucas).
 *
 * Em 10/11, das 10h42 às 10h49, 5 perguntas ao Assistente em 2 minutos
 * derrubaram o dashboard e o resumo de quem perguntava: a função de status era
 * paginada em ondas de 8 (cada página recalcula a função inteira) e fichas e
 * leads iam em paralelo. Aqui: a paginação de função vai em fila, a de tabela
 * pede só as páginas que existem, o cache de 60 s, e uma trava no código —
 * nenhum `buscarTudo` sobre `.rpc(` sem `{ funcao: true }`.
 *
 *   npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { buscarTudo } from '@/lib/zapintel/conversas'
import { lembrar, esquecerTudo, VALIDADE_MS } from '@/lib/assistente/cache'
import { filtroDoStatus } from '@/lib/assistente/ferramentas'

/** Uma fonte de `total` linhas que conta as chamadas e quantas rodam ao mesmo tempo. */
function fonte(total: number, comContagem = false) {
  const st = { chamadas: [] as number[], agora: 0, max: 0 }
  const consulta = async (de: number, ate: number, primeira: boolean) => {
    st.chamadas.push(de)
    st.agora++; st.max = Math.max(st.max, st.agora)
    await new Promise((r) => setTimeout(r, 2))
    st.agora--
    const data = Array.from({ length: Math.max(0, Math.min(total, ate + 1) - de) }, (_, i) => de + i)
    return { data, error: null, count: comContagem && primeira ? total : null }
  }
  return { st, consulta }
}

test('função: páginas em fila, nunca duas ao mesmo tempo, e para na primeira que não vem cheia', async () => {
  const { st, consulta } = fonte(3_220)
  const linhas = await buscarTudo<number>(consulta, { funcao: true })
  assert.equal(linhas.length, 3_220)
  assert.deepEqual(linhas.slice(0, 3), [0, 1, 2])
  assert.deepEqual(st.chamadas, [0, 1000, 2000, 3000])
  assert.equal(st.max, 1)
})

test('função que cabe numa página: uma execução só', async () => {
  const { st, consulta } = fonte(40)
  assert.equal((await buscarTudo<number>(consulta, { funcao: true })).length, 40)
  assert.equal(st.chamadas.length, 1)
})

test('o jeito antigo numa função de 3.220 linhas: 9 execuções, 8 ao mesmo tempo (o que estourou em 10/11)', async () => {
  const { st, consulta } = fonte(3_220)
  assert.equal((await buscarTudo<number>(consulta)).length, 3_220)
  assert.equal(st.chamadas.length, 9)
  assert.equal(st.max, 8)
})

test('tabela com contagem na primeira página: só as páginas que existem', async () => {
  const { st, consulta } = fonte(3_129, true)
  const linhas = await buscarTudo<number>(consulta)
  assert.equal(linhas.length, 3_129)
  assert.deepEqual(linhas, Array.from({ length: 3_129 }, (_, i) => i))
  assert.deepEqual([...st.chamadas].sort((a, b) => a - b), [0, 1000, 2000, 3000])
  // Total múltiplo de 1.000: nenhuma página vazia a mais.
  const exato = fonte(2_000, true)
  assert.equal((await buscarTudo<number>(exato.consulta)).length, 2_000)
  assert.equal(exato.st.chamadas.length, 2)
})

test('cache: 60 s por chave, uma leitura para pedidos simultâneos, erro não fica guardado', async () => {
  esquecerTudo()
  let leituras = 0
  const ler = async () => { leituras++; await new Promise((r) => setTimeout(r, 2)); return leituras }
  const t0 = 1_000_000
  const [a, b] = await Promise.all([lembrar('k', ler, t0), lembrar('k', ler, t0)])
  assert.equal(leituras, 1); assert.equal(a, 1); assert.equal(b, 1)
  assert.equal(await lembrar('k', ler, t0 + VALIDADE_MS - 1), 1)
  assert.equal(await lembrar('k', ler, t0 + VALIDADE_MS), 2)
  assert.equal(await lembrar('outra', ler, t0), 3)

  let falhas = 0
  const falha = async () => { falhas++; throw new Error('banco fora') }
  await assert.rejects(lembrar('ruim', falha, t0))
  await new Promise((r) => setTimeout(r, 0))
  await assert.rejects(lembrar('ruim', falha, t0 + 1))
  assert.equal(falhas, 2)
  esquecerTudo()
})

test('filtro da pergunta que vai ao SQL nunca é mais estreito que a regra do app', () => {
  assert.deepEqual(filtroDoStatus({}, undefined), { filial: null, esperando: null, ativoDias: null, paradoDias: null, classificacao: null })
  assert.deepEqual(filtroDoStatus({ esperando_loja: true, ativo_nos_ultimos_dias: 2.5, parado_ha_dias_min: 3.7, classificacao: 'hot' }, 6),
    { filial: 6, esperando: true, ativoDias: 3, paradoDias: 3, classificacao: 'hot' })
  assert.equal(filtroDoStatus({ esperando_loja: false }, undefined).esperando, false)
  assert.equal(filtroDoStatus({ esperando_loja: 'sim' }, undefined).esperando, null)
  assert.equal(filtroDoStatus({ ativo_nos_ultimos_dias: 0 }, undefined).ativoDias, null)
  assert.equal(filtroDoStatus({ ativo_nos_ultimos_dias: 1e12 }, undefined).ativoDias, null)
  assert.equal(filtroDoStatus({ parado_ha_dias_min: -2 }, undefined).paradoDias, null)
})

test('trava: nenhum buscarTudo sobre .rpc( sem { funcao: true }', () => {
  const arquivos: string[] = []
  const andar = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n.startsWith('.')) continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) andar(p)
      else if (/\.(ts|tsx)$/.test(n)) arquivos.push(p)
    }
  }
  for (const d of ['lib', 'app', 'hooks', 'components']) andar(d)
  const sem: string[] = []
  let comRpc = 0
  for (const a of arquivos) {
    const s = readFileSync(a, 'utf8')
    for (let i = s.indexOf('buscarTudo<'); i >= 0; i = s.indexOf('buscarTudo<', i + 1)) {
      // A chamada vai até o parêntese que fecha a de abertura.
      const ini = s.indexOf('(', i)
      let n = 0, fim = ini
      for (; fim < s.length; fim++) { if (s[fim] === '(') n++; else if (s[fim] === ')' && --n === 0) break }
      const chamada = s.slice(ini, fim + 1)
      if (!/\.rpc\(/.test(chamada)) continue
      comRpc++
      if (!/\{\s*funcao:\s*true\s*\}\s*\)$/.test(chamada)) sem.push(`${a}: ${chamada.slice(0, 80)}`)
    }
  }
  assert.ok(comRpc >= 3, `achou ${comRpc}`) // ponte, pendentes (rota) e pendentes (Assistente)
  assert.deepEqual(sem, [])
})
