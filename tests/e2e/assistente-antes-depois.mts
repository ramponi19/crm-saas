// ANTES × DEPOIS do Assistente numa execução só (10/11/2026). Banco LOCAL (cópia da produção), empresa 1,
// com o login do Eduardo Abreu (admin) — quem fez as perguntas de 10/11 às 10h42–10h44.
//
//   git show main:lib/assistente/ferramentas.ts > .gate/ferramentas-antes.ts
//   node --import ./tests/alias.mjs tests/e2e/assistente-antes-depois.mts
//
// "Antes" = lib/assistente/ferramentas.ts de main (status paginado em ondas de 8, fichas e leads em
// paralelo); "depois" = o da branch. Para cada pergunta, a SAÍDA da ferramenta (o texto que vai ao modelo)
// tem de ser idêntica, e conta-se: quantas consultas, quantas ao mesmo tempo, quanto tempo.
//
// As perguntas de 10/11 não ficam gravadas em lugar nenhum (o chat não guarda o texto); os logs da API
// mostram 5 leads_buscar (4 com a loja Jaguariúna, 1 da rede, nenhuma com texto) e 2 leads_numeros
// (Jaguariúna). Os outros filtros não aparecem no log: cada uma roda com as variações que o modelo usa.
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { acessoDoUsuario } from '@/lib/assistente/acesso'
import { executar as depois } from '@/lib/assistente/ferramentas'
import { esquecerTudo } from '@/lib/assistente/cache'

const env = Object.fromEntries(readFileSync('tests/e2e/status.local.env', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^(\w+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m![1], m![2]]))
const URL_LOCAL = env.API_URL
if (!/127\.0\.0\.1|localhost/.test(URL_LOCAL)) throw new Error('RECUSADO: não é o banco local')

const EDUARDO = 'dea818d4-f6fb-494d-8346-1462986b0828'
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const corpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: EDUARDO, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`
const jwt = `${corpo}.${createHmac('sha256', env.JWT_SECRET).update(corpo).digest('base64url')}`

/** fetch que conta as idas ao banco e quantas estavam no ar ao mesmo tempo. */
const medida = { n: 0, agora: 0, max: 0, rotas: [] as string[] }
const contar: typeof fetch = async (entrada, init) => {
  const u = String(entrada instanceof Request ? entrada.url : entrada)
  if (u.includes('/rest/v1/')) { medida.n++; medida.agora++; medida.max = Math.max(medida.max, medida.agora); medida.rotas.push(u.replace(/^.*\/rest\/v1\//, '').split('?')[0]) }
  try { return await fetch(entrada, init) } finally { if (u.includes('/rest/v1/')) medida.agora-- }
}
const zerar = () => { medida.n = 0; medida.agora = 0; medida.max = 0; medida.rotas = [] }

const db = createClient(URL_LOCAL, env.ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${jwt}` }, fetch: contar }, auth: { persistSession: false, autoRefreshToken: false },
})
const svc = createClient(URL_LOCAL, env.SERVICE_ROLE_KEY, { global: { fetch: contar }, auth: { persistSession: false, autoRefreshToken: false } })

const { executar: antes } = await import(pathToFileURL(resolve('.gate/ferramentas-antes.ts')).href) as { executar: typeof depois }
const acesso = await acessoDoUsuario(db, 1, EDUARDO)
if (acesso.papel !== 'admin') throw new Error(`Eduardo não é admin na cópia: ${acesso.papel}`)
const c = { db, svc, acesso, fuso: 'America/Sao_Paulo' }

const J = 'Jaguariúna'
const VARIACOES: Record<string, unknown>[] = [
  {}, { esperando_loja: true }, { esperando_loja: true, ordenar: 'mais_antigos_sem_resposta' }, { esperando_loja: false, limite: 40 },
  { ativo_nos_ultimos_dias: 1 }, { ativo_nos_ultimos_dias: 7, ordenar: 'score' }, { parado_ha_dias_min: 3 },
  { parado_ha_dias_min: 7, esperando_loja: true }, { classificacao: 'hot' }, { classificacao: 'warm', ativo_nos_ultimos_dias: 3 },
  { etapa: 'novo' }, { criado_de: '2026-11-01', criado_ate: '2026-11-09' }, { texto: 'pro max' }, { texto: 'boleto', esperando_loja: true },
]
const PERGUNTAS: [string, Record<string, unknown>][] = []
for (const v of VARIACOES) PERGUNTAS.push(['leads_buscar', { filial: J, ...v }])
for (const v of VARIACOES) PERGUNTAS.push(['leads_buscar', v])
PERGUNTAS.push(['leads_buscar', { filial: 'Mogi Guaçu', esperando_loja: true }])
PERGUNTAS.push(['leads_numeros', { de: '2026-11-01', ate: '2026-11-09', filial: J, agrupar_por: 'origem' }])
PERGUNTAS.push(['leads_numeros', { de: '2026-10-01', ate: '2026-11-09', filial: J, agrupar_por: 'responsavel' }])
PERGUNTAS.push(['leads_numeros', { de: '2026-10-01', ate: '2026-11-09', agrupar_por: 'etapa' }])
PERGUNTAS.push(['analises_pendentes', {}])
PERGUNTAS.push(['vendas_resumo', { de: '2026-10-01', ate: '2026-11-09', agrupar_por: 'vendedor' }])

const tempo = async <T,>(f: () => Promise<T>) => { const t = performance.now(); const r = await f(); return { r, ms: Math.round(performance.now() - t) } }
let iguais = 0, diferentes = 0
const linhas: string[] = []
for (const [nome, e] of PERGUNTAS) {
  zerar(); const a = await tempo(() => antes(c, nome, e)); const ma = { n: medida.n, max: medida.max }
  esquecerTudo(); zerar(); const d = await tempo(() => depois(c, nome, e)); const md = { n: medida.n, max: medida.max, rotas: [...medida.rotas] }
  const ok = a.r === d.r
  if (ok) iguais++; else diferentes++
  const enc = (s: string) => { try { const o = JSON.parse(s); return o.encontrados ?? o.total ?? o.desatualizadas ?? o.totais?.vendas ?? '-' } catch { return '?' } }
  linhas.push(`${ok ? 'IGUAL ' : 'DIFERE'} ${nome} ${JSON.stringify(e)} | achados ${enc(a.r)} | antes ${ma.n} consultas (até ${ma.max} juntas) ${a.ms} ms → depois ${md.n} (até ${md.max}) ${d.ms} ms [${md.rotas.join(', ')}]`)
  if (!ok) {
    let i = 0; while (i < a.r.length && a.r[i] === d.r[i]) i++
    linhas.push(`   primeira diferença no caractere ${i}: antes …${a.r.slice(Math.max(0, i - 60), i + 80)}…\n                                     depois …${d.r.slice(Math.max(0, i - 60), i + 80)}…`)
  }
}
console.log(linhas.join('\n'))

// As 5 de 10/11 em sequência, como o Eduardo fez (cache valendo): quantas consultas cada uma.
console.log('\n── As 5 leads_buscar de 10/11 em sequência, com o cache ──')
esquecerTudo()
for (const [i, e] of [{ filial: J }, { filial: J, esperando_loja: true }, { filial: J }, { filial: J, ativo_nos_ultimos_dias: 7 }, {}].entries()) {
  zerar(); const d = await tempo(() => depois(c, 'leads_buscar', e))
  console.log(`  ${i + 1}ª ${JSON.stringify(e)}: ${medida.n} consultas, até ${medida.max} juntas, ${d.ms} ms [${medida.rotas.join(', ')}]`)
}
console.log(`\n${iguais} iguais, ${diferentes} diferentes, de ${PERGUNTAS.length} perguntas`)
process.exit(diferentes ? 1 : 0)
