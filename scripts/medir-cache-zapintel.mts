/**
 * MEDE O QUE O CACHE DO PAINEL ECONOMIZA.
 *
 * Existe por causa do aviso da Vercel de 09/10/2026: 75% das 4 h de Active CPU
 * que o plano free dá por mês, e estourar PAUSA os projetos. A rota
 * `/zapintel/api/painel` era o maior consumidor do CRM — 87 chamadas = 4 min de
 * CPU, 2,76 s cada.
 *
 * Roda o caminho de verdade (`montarPainel` + `lib/zapintel/cache`), não uma
 * imitação: calcula, guarda, lê de volta e compara. O número que sai daqui é o
 * que decide se a janela de recálculo está no lugar certo.
 *
 *     npx tsx scripts/medir-cache-zapintel.mts [empresaId]
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { montarPainel } from '../lib/zapintel/painel'
import { cacheServe, guardarPainel, painelDoCache } from '../lib/zapintel/cache'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const EMPRESA = Number(process.argv[2] ?? 1)
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`

const t0 = Date.now()
const { painel } = await montarPainel(db, EMPRESA)
const calculo = Date.now() - t0
const texto = JSON.stringify(painel)

console.log(`empresa ${EMPRESA} — ${painel.mensagens} mensagens, ${painel.leads.length} leads`)
console.log(`  calcular ........ ${calculo} ms   (${JSON.stringify(painel.tempos)})`)
console.log(`  tamanho ......... ${mb(texto.length)}`)

const t1 = Date.now()
await guardarPainel(db, EMPRESA, texto, painel.ultimaMensagem, painel.mensagens, painel.ms)
console.log(`  gravar .......... ${Date.now() - t1} ms`)

const t2 = Date.now()
const lido = await painelDoCache(db, EMPRESA)
const leitura = Date.now() - t2
console.log(`  ler do cache .... ${leitura} ms`)

// O texto que volta tem de ser EXATAMENTE o que entrou: a rota o devolve como
// corpo da resposta, sem parse. Um byte diferente vira JSON quebrado na tela.
const igual = lido?.texto === texto
console.log(`
  volta identico .. ${igual ? 'sim' : 'NAO - a rota devolveria JSON quebrado'}`)
console.log(`  abrir a tela .... serve cache? ${cacheServe(lido!.marca, false)} (sempre, tenha a idade que tiver)`)
console.log(`  botao agora ..... recalcula? ${!cacheServe(lido!.marca, true)} (nao: piso de 1 min contra clique repetido)`)
console.log(`  botao em 2 min .. recalcula? ${!cacheServe(
  { ...lido!.marca, calculadoEm: new Date(Date.now() - 120_000).toISOString() }, true,
)}`)

console.log(`
  economia por abertura: ${calculo} ms -> ${leitura} ms (${(calculo / leitura).toFixed(1)}x)`)
process.exit(igual ? 0 : 1)
