// Quadro pela última mensagem do CLIENTE (06/11) — app e Supabase LOCAIS, migração 20261106000100 aplicada.
// Três leads novos em Mogi ("Novo"):
//   X  cliente há 10 min, você respondeu há 1 min
//   Y  cliente há 5 min, sem resposta (esperando)
//   Z  cliente há 30 min, você respondeu agora
// Regra antiga (qualquer lado): Z, X, Y. Regra nova (cliente): Y, X, Z — e cada cartão mostra os dois tempos.
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const PORTA = process.env.DB_PORT || '54322'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', [`host=127.0.0.1 port=${PORTA} dbname=postgres user=postgres password=postgres`, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '').split('\n').pop()
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now(), MK = `Quadro Cli ${String(T).slice(-6)}`
const contatos = []
const filialAntes = sql(`select coalesce(filial_atual_id::text,'null') from usuarios where id='${DONO}'`)
const etapaNovo = sql(`select id from funil_etapas where funil_id=1 order by ordem limit 1`)

try {
  for (const [letra, recebida, enviada] of [['X', '10 minutes', '1 minute'], ['Y', '5 minutes', null], ['Z', '30 minutes', '20 seconds']]) {
    const c = sql(`insert into contatos (empresa_id, filial_id, nome, telefone, tipo, ativo) values (1, 3, '${MK} ${letra}', '5519${String(T).slice(-7)}${contatos.length}', 'pessoa', true) returning id`)
    contatos.push(c)
    sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, created_at) values (1, 3, ${c}, 1, ${etapaNovo}, 'aberto', now() - interval '2 hours')`)
    const um = enviada ? `least(now() - interval '${recebida}', now() - interval '${enviada}')` : `now() - interval '${recebida}'`
    sql(`insert into conversas (empresa_id, filial_id, contato_id, canal_id, status, nao_lidas, ultima_recebida_at, ultima_enviada_at, ultima_mensagem_at)
         values (1, 3, ${c}, 15, 'aberta', 0, now() - interval '${recebida}', ${enviada ? `now() - interval '${enviada}'` : 'null'}, greatest(now() - interval '${recebida}', ${enviada ? `now() - interval '${enviada}'` : `now() - interval '${recebida}'`}))`)
    void um
  }
  ok(`cenário: 3 leads em "Novo" de Mogi (contatos ${contatos.join(', ')})`)

  sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })).newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 200)))
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  await page.goto(BASE + '/leads', { waitUntil: 'networkidle', timeout: 240000 })
  await page.waitForTimeout(2000)

  const cartoes = () => page.evaluate((mk) => [...document.querySelectorAll(`[data-etapa] [data-lead-id]`)]
    .filter((c) => c.innerText.includes(mk))
    .map((c) => ({ nome: c.innerText.split('\n')[0].trim().slice(-1), cliente: c.querySelector('[data-tempo="cliente"]')?.textContent?.trim() ?? '', voce: c.querySelector('[data-tempo="voce"]')?.textContent?.trim() ?? '', cor: c.querySelector('[data-tempo="cliente"]')?.className ?? '' })), MK)
  const c = await cartoes()
  confere(c.map((x) => x.nome).join('') === 'YXZ', `ordem pela mensagem do cliente: ${c.map((x) => x.nome).join(' > ')} (regra antiga seria Z > X > Y)`)
  const por = Object.fromEntries(c.map((x) => [x.nome, x]))
  confere(por.X?.cliente === 'cliente há 10 min' && por.X?.voce === '· você respondeu há 1 min', `X mostra "${por.X?.cliente} ${por.X?.voce}"`)
  confere(por.Y?.cliente === 'cliente há 5 min' && !por.Y?.voce && /font-semibold/.test(por.Y?.cor ?? ''), `Y (esperando) mostra "${por.Y?.cliente}" com a cor do SLA, sem "você respondeu"`)
  confere(por.Z?.cliente === 'cliente há 30 min' && por.Z?.voce === '· você respondeu agora', `Z mostra "${por.Z?.cliente} ${por.Z?.voce}"`)

  // "Carregar mais": o cursor é o mesmo da ordem — nenhum cartão repetido na coluna.
  const novo = page.locator(`[data-etapa]`).first()
  const botao = novo.getByRole('button', { name: /Carregar mais/ })
  if (await botao.count()) {
    await botao.click(); await page.waitForTimeout(2500)
    const idsCol = await novo.evaluate((col) => [...col.querySelectorAll('[data-lead-id]')].map((e) => e.getAttribute('data-lead-id')))
    confere(idsCol.length > 50 && new Set(idsCol).size === idsCol.length, `carregar mais: ${idsCol.length} cartões, nenhum repetido`)
    const momentos = Number(sql(`select count(*) from negocios where filial_id=3 and funil_id=1 and etapa_id=${etapaNovo} and ativo`))
    ok(`(coluna "Novo" de Mogi no local: ${momentos} negócios ativos)`)
  } else ok('coluna sem "carregar mais" no local — cursor não exercitado')
  await browser.close()
} catch (e) {
  falha('exceção: ' + String(e?.message ?? e).slice(0, 400))
} finally {
  const cts = contatos.join(',') || '0'
  for (const q of [`delete from negocios where contato_id in (${cts})`, `delete from conversas where contato_id in (${cts})`, `delete from contatos where id in (${cts})`,
    `update usuarios set filial_atual_id=${filialAntes} where id='${DONO}'`]) { try { sql(q) } catch { console.log('limpeza:', q.slice(0, 50)) } }
  console.log('limpo:', sql(`select count(*) from contatos where nome like 'Quadro Cli ${String(T).slice(-6)}%'`) === '0')
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
