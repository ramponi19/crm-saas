// Busca: um resultado por contato e loja (06/11) — app e Supabase LOCAIS.
// Contato fundido com 2 identidades (WhatsApp + Instagram), 2 conversas e 2 negócios abertos em Mogi,
// mais 1 negócio em Jaguariúna. Confere ⌘K (Mogi = 1 resultado com os 2 ícones; Rede = 2, com a loja),
// a lista "Lead" da nova tarefa e a /comunicacao (uma linha por conversa).
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const PORTA = process.env.DB_PORT || '54322'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', [`host=127.0.0.1 port=${PORTA} dbname=postgres user=postgres password=postgres`, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '').split('\n').pop()
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const T = Date.now(), NOME = `Zeferino Fundido ${String(T).slice(-6)}`
const filialAntes = sql(`select coalesce(filial_atual_id::text,'null') from usuarios where id='${DONO}'`)
let contato = null

try {
  const fone = '55199' + String(T).slice(-8)
  contato = sql(`insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, instagram, tipo, ativo) values (1, 3, '${NOME}', '${fone}', '+${fone}', 'zef.${T}', 'pessoa', true) returning id`)
  sql(`insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id) values (1, ${contato}, 'whatsapp', '${fone}'), (1, ${contato}, 'instagram', 'ig${T}')`)
  const etapa = sql(`select id from funil_etapas where funil_id=1 order by ordem limit 1`)
  for (const [loja, dias] of [[3, 3], [3, 1], [6, 2]]) {
    sql(`insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, created_at) values (1, ${loja}, ${contato}, 1, ${etapa}, 'aberto', now() - interval '${dias} days')`)
  }
  const n = sql(`select count(*) from negocios where contato_id=${contato} and ativo`)
  confere(n === '3', `cenário: 3 negócios ativos (2 em Mogi, 1 em Jaguariúna) — ${n}`)
  for (const canal of [15, 26]) { // WhatsApp e Instagram de Mogi
    sql(`insert into conversas (empresa_id, filial_id, contato_id, canal_id, status, nao_lidas, ultima_mensagem_at, ultima_recebida_at) values (1, 3, ${contato}, ${canal}, 'aberta', 0, now() - interval '5 minutes', now() - interval '5 minutes')`)
  }
  confere(sql(`select count(*) from conversas where contato_id=${contato}`) === '2', 'cenário: 2 conversas em Mogi (uma por canal)')
  const principal = sql(`select id from negocios where contato_id=${contato} and filial_id=3 order by created_at desc limit 1`)

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha('pageerror: ' + String(e).slice(0, 200)))
  sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', E.dono); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])

  const buscar = async (termo) => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle', timeout: 240000 })
    await page.keyboard.press('Control+k')
    const caixa = page.getByPlaceholder(/Buscar cliente, lead/)
    await caixa.waitFor()
    await caixa.fill(termo)
    await page.waitForTimeout(1800)
    return page.evaluate((nome) => [...document.querySelectorAll('button[data-idx]')]
      .filter((b) => b.innerText.includes(nome))
      .map((b) => ({ texto: b.innerText.replace(/\n/g, ' | '), canais: [...b.querySelectorAll('[data-canal]')].map((c) => c.getAttribute('data-canal')) })), termo)
  }

  // Mogi
  let r = await buscar(NOME)
  const leadsMogi = r.filter((x) => x.texto.startsWith('Lead'))
  confere(leadsMogi.length === 1, `⌘K em Mogi: 1 resultado de lead (eram 2) — ${JSON.stringify(leadsMogi)}`)
  confere(JSON.stringify(leadsMogi[0]?.canais) === '["whatsapp","instagram"]', `ícones dos canais: ${JSON.stringify(leadsMogi[0]?.canais)}`)
  await page.keyboard.press('Enter')
  await page.waitForURL((u) => u.search.includes('lead='), { timeout: 30000 }).catch(() => {})
  confere(page.url().includes(`lead=${principal}`), `Enter abre o negócio principal (${principal}): ${page.url().split('?')[1]}`)

  // Rede (todas as lojas)
  await page.request.post(BASE + '/api/filial/selecionar', { data: { filialId: null } }).catch(() => null)
  sql(`update usuarios set filial_atual_id=null where id='${DONO}'`)
  r = await buscar(NOME)
  const leadsRede = r.filter((x) => x.texto.startsWith('Lead'))
  confere(leadsRede.length === 2, `⌘K na Rede: 2 resultados, um por loja — ${leadsRede.map((x) => x.texto).join(' // ')}`)
  const lojas = [sql(`select nome from filiais where id=3`), sql(`select nome from filiais where id=6`)]
  confere(lojas.every((l) => leadsRede.some((x) => x.texto.split(' | ')[2]?.startsWith(l + ' · '))), `na Rede o subtítulo diz a loja (${lojas.join(' / ')})`)

  // Tarefa: lista "Lead (opcional)"
  sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
  await page.goto(BASE + '/tarefas', { waitUntil: 'networkidle', timeout: 240000 })
  await page.getByRole('button', { name: 'Nova tarefa' }).first().click()
  const opcoes = await page.getByLabel('Lead (opcional)').locator('option').evaluateAll((os, nome) => os.filter((o) => o.textContent.includes(nome)).map((o) => o.value), NOME)
  confere(opcoes.length === 1 && opcoes[0] === principal, `tarefa: o contato aparece 1 vez na lista de leads, com o principal (${JSON.stringify(opcoes)})`)

  // /comunicacao: uma linha por conversa (cada canal tem a sua)
  await page.goto(BASE + '/comunicacao', { waitUntil: 'networkidle', timeout: 240000 })
  await page.waitForTimeout(1500)
  const linhas = await page.getByText(NOME, { exact: false }).count()
  confere(linhas >= 2, `/comunicacao mostra as 2 conversas do contato (${linhas} ocorrências do nome)`)

  await browser.close()
} catch (e) {
  falha('exceção: ' + String(e?.message ?? e).slice(0, 400))
} finally {
  if (contato) sql(`delete from conversas where contato_id=${contato}; delete from negocios where contato_id=${contato}; delete from contato_identidades where contato_id=${contato}; delete from contatos where id=${contato}`)
  sql(`update usuarios set filial_atual_id=${filialAntes} where id='${DONO}'`)
  console.log('limpo:', contato ? sql(`select count(*) from contatos where id=${contato}`) === '0' : 'nada criado')
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
