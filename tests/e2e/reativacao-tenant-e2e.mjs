// Reativação: a cadência tem de ser da própria empresa (porte do eaa1460). LOCAL, empresa 1.
//   node tests/e2e/reativacao-tenant-e2e.mjs
// Cria uma cadência de teste na empresa 5 (a "outra") e uma na empresa 1, prova:
//   1. salvar a config com a cadência da empresa 5 → 404 e a config não muda;
//   2. salvar com a cadência da empresa 1 → 200;
//   3. config ANTIGA (gravada direto no banco) apontando para a cadência da 5 + executar →
//      0 reativados e 0 inscrições na cadência alheia.
// Devolve a config de reativação da empresa 1 como estava e apaga o que criou, passe ou falhe.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now()

const configAntes = sql(`select coalesce((select valor::text from configuracoes_sistema where empresa_id=1 and chave='reativacao'), '')`)
const alheia = Number(sql(`insert into cadencias (empresa_id, nome, ativo) values (5, 'TESTE REATIV ALHEIA ${T}', true) returning id`))
const propria = Number(sql(`insert into cadencias (empresa_id, nome, ativo) values (1, 'TESTE REATIV PROPRIA ${T}', true) returning id`))
sql(`insert into cadencia_passos (cadencia_id, empresa_id, ordem, dia_offset, titulo) values (${alheia}, 5, 1, 0, 'passo'), (${propria}, 1, 1, 0, 'passo')`)
const lerConfig = () => sql(`select coalesce((select valor::text from configuracoes_sistema where empresa_id=1 and chave='reativacao'), '')`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext()).newPage()
try {
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  const post = (corpo) => page.evaluate(async (b) => {
    const r = await fetch('/api/reativacao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
    return { s: r.status, j: await r.json().catch(() => null) }
  }, corpo)

  const antes = lerConfig()
  const r1 = await post({ ativo: true, dias_frio: 30, incluir_perdidos: true, cadencia_id: alheia })
  confere(r1.s === 404 && lerConfig() === antes, `cadência da OUTRA empresa: ${r1.s} "${r1.j?.error}", config intacta`)

  const r2 = await post({ ativo: true, dias_frio: 30, incluir_perdidos: true, cadencia_id: propria })
  confere(r2.s === 200 && JSON.parse(lerConfig()).cadencia_id === propria, `cadência da própria empresa: ${r2.s}, config gravada`)

  // Config antiga, gravada antes da trava da rota, apontando para a cadência alheia.
  sql(`update configuracoes_sistema set valor = jsonb_build_object('ativo', true, 'dias_frio', 1, 'incluir_perdidos', true, 'cadencia_id', ${alheia}) where empresa_id=1 and chave='reativacao'`)
  const r3 = await post({ executar: true })
  const inscr = sql(`select count(*) from cadencia_inscricoes where cadencia_id=${alheia}`)
  confere(r3.s === 200 && r3.j?.reativados === 0 && inscr === '0', `executar com config antiga alheia: reativados=${r3.j?.reativados}, inscrições na alheia=${inscr}`)
} catch (e) {
  falha('erro: ' + String(e).slice(0, 300))
} finally {
  await browser.close()
  sql(`delete from cadencia_inscricoes where cadencia_id in (${alheia}, ${propria})`)
  sql(`delete from cadencia_passos where cadencia_id in (${alheia}, ${propria})`)
  sql(`delete from cadencias where id in (${alheia}, ${propria})`)
  if (configAntes) sql(`update configuracoes_sistema set valor = '${configAntes.replace(/'/g, "''")}'::jsonb where empresa_id=1 and chave='reativacao'`)
  else sql(`delete from configuracoes_sistema where empresa_id=1 and chave='reativacao'`)
  confere(lerConfig() === configAntes, 'config de reativação da empresa 1 devolvida como estava')
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
  process.exit(falhas.length ? 1 : 0)
}
