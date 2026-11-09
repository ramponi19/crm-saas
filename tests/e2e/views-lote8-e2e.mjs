// Views lote 8 (clientes) — app LOCAL, Supabase LOCAL, view `clientes` já derrubada.
// node views-lote8-e2e.mjs [BASE]   (BASE padrão http://localhost:3010)
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const BASE = process.argv[2] || 'http://localhost:3010', SENHA = 'teste-local-22'
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')
const DONO = 'a632db2c-c42b-4973-8008-2d5ca2dbf479', VMOGI = 'dd2ae788-0e28-47af-86e2-73a15d1d600f', VJAG = '67065f4d-c70a-4f44-8e6e-430841f0ce19'
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((e) => e.innerText.replace(/\n/g, ' ')))
const T = Date.now(), MK = `TESTE L8 ${T}`
const CPF_OK = '52998224725', CPF_RUIM = '52998224724'
const criados = []        // contatos criados pelo teste (apagar no fim)
const marcados = []       // contatos que já existiam e viraram cliente (devolver no fim)

confere(sql(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname='clientes'`) === '0', 'a view clientes não existe no local')
confere(sql(`select count(*) from pg_proc where proname in ('fundir_clientes','compat_clientes_iud')`) === '0', 'fundir_clientes e compat_clientes_iud não existem')
sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => falha(`pageerror (${email}): ` + String(e).slice(0, 200)))
  await page.goto(BASE + '/login', { timeout: 240000 })
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 240000 }), page.click('button[type="submit"]')])
  const api = (url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) } }, [url, method, body])
  return { page, api, ctx }
}

try {
  // ------------------------------------------------------------------ dono, Mogi
  const dono = await entrar(E.dono)
  const { page, api } = dono
  const g = await page.goto(BASE + '/clientes', { waitUntil: 'networkidle', timeout: 240000 })
  confere(g.status() === 200, '/clientes 200')
  await page.waitForTimeout(1500)
  const linhasTela = await page.locator('tbody tr').count()
  // O que a RLS mostra ao dono com Mogi no topo (a view era security_invoker: a mesma conta).
  const comoRls = (uid) => Number(sql(`set role authenticated; set request.jwt.claims='{"sub":"${uid}","role":"authenticated"}'; select count(*) from contatos where dados ? '_cliente'`).split('\n').pop())
  const noBanco = comoRls(DONO)
  confere(linhasTela === noBanco, `lista mostra os ${noBanco} clientes que a RLS mostra ao dono em Mogi (tela ${linhasTela})`)
  const algum = sql(`select nome from contatos where empresa_id=1 and dados ? '_cliente' and nome ~ '^[A-Za-z]{4}' order by id limit 1`)
  await page.getByPlaceholder(/Buscar cliente/).fill(algum.slice(0, 6))
  await page.waitForTimeout(400)
  const filtradas = await page.locator('tbody tr').count()
  confere(filtradas >= 1 && filtradas < linhasTela && (await page.locator('tbody').innerText()).includes(algum.trim()), `busca por "${algum.slice(0, 6)}" filtra (${filtradas} linhas)`)
  await page.getByPlaceholder(/Buscar cliente/).fill('')

  // criar pela tela
  await page.getByRole('button', { name: 'Novo cliente' }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.waitFor()
  const preencher = async (cpf, nome) => {
    await dlg.getByLabel('Nome completo').fill(nome)
    await dlg.getByLabel('Telefone / WhatsApp').fill('(19) 9' + String(T).slice(-8))
    await dlg.getByLabel('CPF / CNPJ').fill(cpf)
    await dlg.getByLabel('Data de nascimento').fill('1990-05-17')
    await dlg.getByLabel('Estado civil').selectOption('Casado(a)')
    await dlg.getByLabel('Profissão').fill('Comerciante')
    await dlg.getByLabel('CEP').fill('13840-000')
    await dlg.getByLabel('Endereço (Rua / Av.)').fill('Rua do Teste')
    await dlg.getByLabel('Nº').fill('42')
    await dlg.getByLabel('Bairro').fill('Centro')
    await dlg.getByLabel('Cidade').fill('Mogi Guaçu')
    await dlg.getByLabel('Estado (UF)').fill('SP')
    await dlg.getByLabel('Origem do cliente').selectOption('Indicação')
  }
  await preencher(CPF_RUIM, MK)
  await dlg.getByRole('button', { name: 'Salvar' }).click()
  await page.waitForTimeout(800)
  confere((await toasts(page)).some((t) => t.includes('CPF inválido')), 'CPF inválido: a tela recusa antes de enviar')
  confere(sql(`select count(*) from contatos where nome='${MK}'`) === '0', 'CPF inválido: nada gravado')
  const rRuim = await api('/api/clientes', 'POST', { nome: MK, cpf_cnpj: CPF_RUIM })
  confere(rRuim.status === 400 && /CPF inválido/.test(rRuim.json?.error ?? ''), `CPF inválido: a rota responde 400 (${rRuim.status} ${rRuim.json?.error})`)
  const rCurto = await api('/api/clientes', 'POST', { nome: MK, cpf_cnpj: '123.456' })
  confere(rCurto.status === 400, 'documento incompleto: 400')

  await dlg.getByLabel('CPF / CNPJ').fill(CPF_OK)
  await dlg.getByRole('button', { name: 'Salvar' }).click()
  await dlg.waitFor({ state: 'hidden', timeout: 20000 })
  const novo = sql(`select id||'|'||filial_id||'|'||(dados->>'tipo_cliente')||'|'||(dados->>'origem_cliente')||'|'||(dados->>'data_nascimento')||'|'||(dados->'_cliente'->>'cpf_validado')||'|'||(endereco->>'cidade')||'|'||(endereco->>'logradouro')||'|'||origem||'|'||coalesce(telefone_e164,'-') from contatos where nome='${MK}'`).split('|')
  criados.push(Number(novo[0]))
  confere(novo.length > 1, `criado pela tela (contato ${novo[0]})`)
  confere(novo[1] === '3', 'nasce na loja escolhida no topo (Mogi, 3)')
  confere(novo[2] === 'Novo' && novo[3] === 'Indicação', `tipo e origem em dados (${novo[2]}, ${novo[3]})`)
  confere(novo[4] === '1990-05-17' && novo[5] === 'true', 'nascimento em dados, cpf_validado true')
  confere(novo[6] === 'Mogi Guaçu' && novo[7] === 'Rua do Teste', 'endereço em contatos.endereco')
  confere(novo[8] === 'Indicação' && novo[9].startsWith('+55199'), 'origem do contato e telefone E.164 como o gatilho fazia')
  await page.waitForTimeout(1000)
  confere((await page.locator('tbody').innerText()).includes(MK), 'a lista mostra o cliente novo')

  // editar pela tela
  await page.locator('tr', { hasText: MK }).first().click()
  await dlg.waitFor()
  await dlg.getByLabel('Profissão').fill('Engenheiro')
  await dlg.getByLabel('Cidade').fill('Mogi Mirim')
  await dlg.getByLabel('Tipo de cliente').selectOption('VIP')
  await dlg.getByRole('button', { name: 'Salvar' }).click()
  await dlg.waitFor({ state: 'hidden', timeout: 20000 })
  const ed = sql(`select (dados->>'profissao')||'|'||(endereco->>'cidade')||'|'||(dados->>'tipo_cliente')||'|'||filial_id||'|'||(dados->>'data_nascimento') from contatos where id=${novo[0]}`)
  confere(ed === 'Engenheiro|Mogi Mirim|VIP|3|1990-05-17', `editar grava (${ed})`)
  const rEdRuim = await api(`/api/clientes/${novo[0]}`, 'PATCH', { cpf_cnpj: CPF_RUIM })
  confere(rEdRuim.status === 400, 'editar com CPF inválido: 400')

  // o cliente aparece no PDV e na encomenda; o contrato lê pela camada (comparar-contrato: 12/12 idênticos)
  const pdv = await page.goto(BASE + '/pdv', { waitUntil: 'networkidle', timeout: 240000 })
  confere(pdv.status() === 200 && (await page.content()).includes(MK), 'o cliente novo está na lista do PDV')
  for (const rota of ['/estoque', '/historico', '/garantia', '/assistencia', '/financeiro', '/relatorios', '/orcamentos', '/agenda', '/visao-geral']) {
    const r = await page.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 240000 })
    confere(r.status() === 200, `${rota} 200`)
  }
  const hist = sql(`select c.nome from vendas_vendas v join contatos c on c.id=v.cliente_id where v.empresa_id=1 and v.filial_id=3 order by v.data_venda desc limit 1`)
  await page.goto(BASE + '/historico', { waitUntil: 'networkidle' })
  confere((await page.content()).includes(hist.trim().split(' ')[0]), `histórico mostra o cliente da venda pelo embed ("${hist.trim()}")`)
  const exp = await page.evaluate(async () => { const r = await fetch('/api/exportar?tipo=clientes'); return { s: r.status, t: await r.text() } })
  confere(exp.s === 200 && exp.t.includes(MK) && exp.t.split('\n').length - 1 === noBanco + 1, `exportar clientes: CSV com ${noBanco + 1} linhas`)

  // fundir e desfazer (API da tela de Clientes), com venda no secundário
  const vendaSec = sql(`select v.id||'|'||v.cliente_id from vendas_vendas v join contatos c on c.id=v.cliente_id where v.empresa_id=1 and c.dados ? '_cliente' and c.filial_id=3 order by v.id desc limit 1`).split('|')
  const antesSec = sql(`select md5(c::text) from contatos c where id=${vendaSec[1]}`)
  const rF = await api('/api/clientes/fundir', 'POST', { principal: Number(novo[0]), secundario: Number(vendaSec[1]) })
  confere(rF.status === 200 && typeof rF.json?.fusaoId === 'number', `fundir: 200, fusão ${rF.json?.fusaoId}`)
  confere(sql(`select count(*) from contatos where id=${vendaSec[1]}`) === '0' && sql(`select cliente_id from vendas_vendas where id=${vendaSec[0]}`) === novo[0], 'fundir: o secundário sai e a venda passa para o principal')
  const rD = await api('/api/contatos/fundir/desfazer', 'POST', { fusaoId: rF.json?.fusaoId })
  confere(rD.status === 200, `desfazer: 200 (${JSON.stringify(rD.json?.voltou ?? rD.json)})`)
  confere(sql(`select md5(c::text) from contatos c where id=${vendaSec[1]}`) === antesSec, 'desfazer: o secundário volta idêntico (linha inteira)')
  confere(sql(`select cliente_id from vendas_vendas where id=${vendaSec[0]}`) === vendaSec[1], 'desfazer: a venda volta para ele')
  confere((await api('/api/clientes/fundir', 'POST', { principal: Number(novo[0]), secundario: 3592 })).status === 400, 'fundir com contato que não é cliente: 400')

  // ------------------------------------------------------------------ vendedor de Mogi
  const vm = await entrar(E.vend_mogi)
  await vm.page.goto(BASE + '/clientes', { waitUntil: 'networkidle', timeout: 240000 })
  await vm.page.waitForTimeout(1000)
  const vistosVM = Number(sql(`set role authenticated; set request.jwt.claims='{"sub":"${VMOGI}","role":"authenticated"}'; select count(*) from contatos where dados ? '_cliente'`).split('\n').pop())
  confere((await vm.page.locator('tbody tr').count()) === vistosVM, `vendedor de Mogi vê ${vistosVM} clientes (o que a RLS mostra)`)
  // telefone de um contato só de Jaguariúna: o vendedor de Mogi não o enxerga, mas o cadastro acha e marca
  const tel3592 = sql(`select telefone from contatos where id=3592`)
  marcados.push({ id: 3592, dados: sql(`select dados::text from contatos where id=3592`), nome: sql(`select coalesce(nome,'') from contatos where id=3592`), endereco: sql(`select endereco::text from contatos where id=3592`) })
  const rVM = await vm.api('/api/clientes', 'POST', { nome: `${MK} VM`, telefone: tel3592, cidade: 'Jaguariúna' })
  confere(rVM.status === 200 && rVM.json?.cliente?.id === 3592, `vendedor de Mogi cadastra telefone que é de Jaguariúna: vira cliente o contato 3592 (${rVM.status} ${rVM.json?.cliente?.id ?? rVM.json?.error})`)
  confere(sql(`select filial_id||'|'||(dados ? '_cliente') from contatos where id=3592`) === '6|true', 'o contato continua em Jaguariúna, agora cliente')
  confere((await vm.api('/api/clientes/3592', 'PATCH', { profissao: 'X' })).status === 404, 'vendedor de Mogi não edita cliente que não enxerga: 404')
  const rVM2 = await vm.api(`/api/clientes/${novo[0]}`, 'PATCH', { observacoes: 'editado pelo vendedor' })
  confere(rVM2.status === 200, 'vendedor de Mogi edita cliente da loja dele')
  confere((await vm.api('/api/clientes/fundir', 'POST', { principal: 1, secundario: 2 })).status === 403, 'vendedor não funde: 403')

  // ------------------------------------------------------------------ vendedor de Jaguariúna, e o dono em Jaguariúna
  const vj = await entrar(E.vend_jag)
  await vj.page.goto(BASE + '/clientes', { waitUntil: 'networkidle', timeout: 240000 })
  await vj.page.waitForTimeout(1000)
  const vistosVJ = Number(sql(`set role authenticated; set request.jwt.claims='{"sub":"${VJAG}","role":"authenticated"}'; select count(*) from contatos where dados ? '_cliente'`).split('\n').pop())
  confere((await vj.page.locator('tbody tr').count()) === vistosVJ, `vendedor de Jaguariúna: tela = RLS (${vistosVJ})`)
  const rVJ = await vj.api('/api/clientes', 'POST', { nome: `${MK} VJ`, cpf_cnpj: CPF_OK })
  const idVJ = rVJ.json?.cliente?.id; if (idVJ) criados.push(idVJ)
  confere(rVJ.status === 200 && sql(`select filial_id from contatos where id=${idVJ}`) === '6', 'vendedor de Jaguariúna cadastra: nasce na loja dele (6)')
  sql(`update usuarios set filial_atual_id=6 where id='${DONO}'`)
  const rDJ = await api('/api/clientes', 'POST', { nome: `${MK} DJ` })
  const idDJ = rDJ.json?.cliente?.id; if (idDJ) criados.push(idDJ)
  confere(rDJ.status === 200 && sql(`select filial_id from contatos where id=${idDJ}`) === '6', 'dono com Jaguariúna no topo cadastra: nasce em Jaguariúna')
  sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)

  // desativar
  const rDes = await api(`/api/clientes/${novo[0]}`, 'PATCH', { ativo: false })
  confere(rDes.status === 200 && sql(`select ativo from contatos where id=${novo[0]}`) === 'f', 'desativar')

  // conversão de lead (card): o contato do lead vira o cliente, sem contato novo
  const lead = sql(`select n.id||'|'||n.contato_id from negocios n join contatos c on c.id=n.contato_id where n.empresa_id=1 and n.filial_id=3 and not c.dados ? '_cliente' and c.telefone is not null order by n.id desc limit 1`).split('|')
  marcados.push({ id: Number(lead[1]), dados: sql(`select dados::text from contatos where id=${lead[1]}`), nome: sql(`select coalesce(nome,'') from contatos where id=${lead[1]}`), endereco: sql(`select endereco::text from contatos where id=${lead[1]}`) })
  const nContatos = sql(`select count(*) from contatos where empresa_id=1`)
  const rConv = await api('/api/clientes', 'POST', { nome: 'Lead convertido', telefone: sql(`select telefone from contatos where id=${lead[1]}`), lead_id: Number(lead[0]), ativo: true })
  confere(rConv.status === 200 && rConv.json?.cliente?.id === Number(lead[1]) && sql(`select count(*) from contatos where empresa_id=1`) === nContatos, 'converter lead: o contato do lead vira cliente, nenhum contato novo')
} catch (e) {
  falha('exceção: ' + String(e?.stack ?? e).slice(0, 400))
} finally {
  // limpeza: o que o teste criou sai; o que ele marcou volta como era
  for (const id of criados) sql(`delete from contatos where id=${id}`)
  for (const m of marcados) sql(`update contatos set dados=$$${m.dados}$$::jsonb, endereco=$$${m.endereco}$$::jsonb, nome=nullif($$${m.nome}$$,'') where id=${m.id}`)
  sql(`update usuarios set filial_atual_id=3 where id='${DONO}'`)
  console.log('sobrou do teste:', sql(`select count(*) from contatos where nome like 'TESTE L8%'`))
  await browser.close()
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
  process.exit(falhas.length ? 1 : 0)
}
