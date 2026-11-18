// Primeiro piloto (18/11/2026) com DUAS empresas: importação de contatos e leads por planilha (tela e API,
// CSV e XLSX), deduplicação por telefone só dentro da empresa, etiqueta "importação", relatório das recusadas,
// histórico isolado; situação Piloto/Teste/Pagante/Cortesia em um clique; acompanhamento por empresa.
//   A = empresa 1 (JM local, dono do usuarios.local.json).  B = empresa nova pelo /api/register.
// Precisa da migração 20261118000200 no banco LOCAL. App LOCAL :3010, Supabase LOCAL.
// Rodar: node tests/e2e/piloto-importacao-e2e.mjs
import { E } from './_usuarios.mjs'
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
const BASE = 'http://localhost:3010', SENHA = 'teste-local-22'
const env = Object.fromEntries(fs.readFileSync(`${import.meta.dirname}/status.local.env`, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const sql = (q) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe', ['host=127.0.0.1 port=' + (process.env.DB_PORT ?? '54322') + ' dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).replace(/\r/g, '').trim()
const falhas = []; const ok = (m) => console.log('ok  ', m); const falha = (m) => { falhas.push(m); console.log('FALHA', m) }
const confere = (c, m) => (c ? ok(m) : falha(m))

if (sql(`select count(*) from information_schema.columns where table_name='empresas' and column_name='piloto'`) !== '1') { console.error('Falta a migração 20261118000200 no banco local.'); process.exit(2) }
sql(`delete from rate_limit where chave like 'register%'`)

const svc = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = Date.now()
const EMAIL_B = `dono-piloto-${T}@e2e.test`, NOME_B = `Piloto e2e ${T}`
let empresaB = null
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-e2e-'))

const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function entrar(email) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true })).newPage()
  await page.goto(BASE + '/login', { timeout: 300000 })
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 300000 }), page.click('button[type="submit"]')])
  return page
}
const api = (page, url, method = 'GET', body) => page.evaluate(async ([u, m, b]) => {
  const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
  return { status: r.status, json: await r.json().catch(() => null) }
}, [url, method, body])

// Telefones: P1 já existe em B antes; P2/P3 novos; PA existe só na empresa A.
const PA_e164 = sql(`select telefone_e164 from contatos where empresa_id=1 and telefone_e164 like '+55%' order by id limit 1`)
const PA = PA_e164.slice(3)
const contatoA = sql(`select id||'|'||coalesce(nome,'')||'|'||etiqueta_ids::text||'|'||updated_at from contatos where empresa_id=1 and telefone_e164='${PA_e164}'`)
const etqA = sql(`select count(*) from etiquetas where empresa_id=1`)
const sufixo = String(T).slice(-4)
const P1 = `1197001${sufixo}`, P2 = `1197002${sufixo}`, P3 = `1197003${sufixo}`

try {
  // ── B nasce pelo cadastro e tem um contato com P1 (lead aberto) ─────────────
  const reg = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    email: EMAIL_B, password: SENHA, nomeUsuario: 'Dono Piloto', nomeEmpresa: NOME_B, telefone: '11999990000', aceite: true }) })
  empresaB = (await reg.json()).empresaId ?? null
  confere(reg.status === 200 && empresaB, `empresa B cadastrada (${reg.status})`)
  if (!empresaB) throw new Error('sem empresa B')
  const pB = await entrar(EMAIL_B)
  let r = await api(pB, '/api/leads', 'POST', { nome: 'Já Existia', telefone: P1 })
  confere(r.status === 200, `B: contato P1 com lead aberto (${r.status})`)

  // ── Importação pela tela (CSV) ──────────────────────────────────────────────
  const csv = ['Nome do cliente;Celular;E-mail;Interesse;Valor',
    `Novo Um;${P2};um@x.com;Modelo A;R$ 50.000,00`,
    `Novo Dois;(${P3.slice(0, 2)}) ${P3.slice(2, 7)}-${P3.slice(7)};;;`,
    `Outro Nome;${P1};;;`,
    `Da Empresa A Aqui;${PA};;;`,
    `Repetido;+55 ${P2};;;`,
    `Fone Ruim;123;;;`,
    `Sem Fone;;;;`].join('\r\n')
  const arqCsv = path.join(tmp, 'contatos-piloto.csv'); fs.writeFileSync(arqCsv, '\uFEFF' + csv)
  await pB.goto(BASE + '/configuracoes/importar', { timeout: 300000 })
  await pB.locator('input[type="file"]').setInputFiles(arqCsv)
  await pB.getByRole('button', { name: 'Ver prévia' }).waitFor({ timeout: 60000 })
  const sel = async (rot) => pB.getByLabel(rot, { exact: true }).evaluate((s) => s.options[s.selectedIndex]?.text)
  confere(await sel('Telefone / WhatsApp *') === 'Celular' && await sel('Nome') === 'Nome do cliente' && await sel('Valor estimado') === 'Valor', 'mapeamento sugerido pelo cabeçalho')
  await pB.getByRole('button', { name: 'Ver prévia' }).click()
  await pB.getByText('Prévia (nada foi gravado ainda)').waitFor({ timeout: 60000 })
  const num = async (attr, rot) => Number((await pB.locator(`[${attr}="${rot}"] .num`).innerText()).trim())
  const prev = [await num('data-previa', 'Contatos novos'), await num('data-previa', 'Já existiam'), await num('data-previa', 'Leads a criar'), await num('data-previa', 'Recusadas')]
  confere(prev.join(',') === '3,1,3,3', `prévia: 3 novos (P2, P3 e o telefone da A), 1 já existia, 3 leads, 3 recusadas (${prev})`)
  confere(sql(`select count(*) from contatos where empresa_id=${empresaB}`) === '1', 'prévia não grava nada')
  const tPrev = await pB.locator('body').innerText()
  confere(/telefone repetido na planilha/.test(tPrev) && /telefone inválido/.test(tPrev) && /sem telefone/.test(tPrev), 'prévia lista os motivos das recusadas')
  const [baixa] = await Promise.all([pB.waitForEvent('download'), pB.getByRole('button', { name: 'Baixar relatório' }).click()])
  const relatorio = fs.readFileSync(await baixa.path(), 'utf8')
  confere(/linha;motivo;Nome do cliente/.test(relatorio) && /;telefone repetido na planilha/.test(relatorio) && relatorio.split('\r\n').length === 4, 'relatório das recusadas em CSV (cabeçalho + 3 linhas)')
  await pB.getByRole('button', { name: /^Importar 4 contatos/ }).click()
  await pB.getByRole('heading', { name: 'Importação concluída' }).waitFor({ timeout: 60000 })
  const res = [await num('data-resultado', 'Contatos novos'), await num('data-resultado', 'Já existiam'), await num('data-resultado', 'Leads criados'), await num('data-resultado', 'Recusadas')]
  confere(res.join(',') === '3,1,3,3', `resultado: 3 novos, 1 já existia, 3 leads, 3 recusadas (${res})`)
  if (res.join(',') !== '3,1,3,3') console.log((await pB.locator('body').innerText()).split(/\n/).filter((l) => /não criou|não gravou|limite/.test(l)).join(' | '))

  // ── O que ficou no banco ────────────────────────────────────────────────────
  const etqB = sql(`select id from etiquetas where empresa_id=${empresaB} and nome like 'importa%o'`)
  confere(/^\d+$/.test(etqB), `B ganhou a etiqueta "importação" (${etqB})`)
  const imp = sql(`select count(*) from contatos where empresa_id=${empresaB} and origem='importacao' and etiqueta_ids @> array[${etqB}::bigint]`)
  confere(imp === '3', `3 contatos importados com a etiqueta (${imp})`)
  const valor = sql(`select c.nome||'|'||c.email||'|'||n.valor_estimado||'|'||(n.dados->>'produto_interessado')||'|'||(n.dados->'_lead'->>'origem')||'|'||n.status||'|'||(n.funil_id is not null) from contatos c join negocios n on n.contato_id=c.id where c.empresa_id=${empresaB} and c.telefone_e164='+55${P2}'`)
  confere(valor === 'Novo Um|um@x.com|50000.00|Modelo A|importacao|aberto|true' || valor === 'Novo Um|um@x.com|50000|Modelo A|importacao|aberto|true', `lead com valor, interesse e origem importação no funil (${valor})`)
  const p3 = sql(`select nome from contatos where empresa_id=${empresaB} and telefone_e164='+55${P3}'`)
  confere(p3 === 'Novo Dois', 'telefone com máscara reconhecido')
  const p1 = sql(`select c.nome||'|'||(select count(*) from negocios n where n.contato_id=c.id)||'|'||cardinality(c.etiqueta_ids) from contatos c where c.empresa_id=${empresaB} and c.telefone_e164='+55${P1}'`)
  confere(p1 === 'Já Existia|1|0', `contato que já existia não muda e não ganha lead (já tinha aberto) (${p1})`)
  const pa = sql(`select count(*) from contatos where empresa_id=${empresaB} and telefone_e164='${PA_e164}'`)
  confere(pa === '1', 'telefone que só existe na A vira contato NOVO em B (dedup só dentro da empresa)')
  const aDepois = sql(`select id||'|'||coalesce(nome,'')||'|'||etiqueta_ids::text||'|'||updated_at from contatos where empresa_id=1 and telefone_e164='${PA_e164}'`)
  confere(aDepois === contatoA && sql(`select count(*) from etiquetas where empresa_id=1`) === etqA, 'empresa A intocada (contato e etiquetas)')
  const reg1 = sql(`select total||'|'||contatos_novos||'|'||contatos_existentes||'|'||leads_criados||'|'||jsonb_array_length(recusadas)||'|'||arquivo from importacoes where empresa_id=${empresaB}`)
  confere(reg1 === '7|3|1|3|3|contatos-piloto.csv', `importação registrada em importacoes (${reg1})`)
  await pB.reload(); await pB.getByText('Importações anteriores').waitFor({ timeout: 60000 })
  confere(/contatos-piloto\.csv/.test(await pB.locator('body').innerText()), 'histórico na tela')

  // ── XLSX pela API, só contatos (sem lead) ───────────────────────────────────
  const { criarZip } = await import('../../lib/zip.ts').catch(() => ({}))
  let xlsxB64 = null
  if (criarZip) {
    xlsxB64 = criarZip([
      { nome: 'xl/sharedStrings.xml', conteudo: '<sst><si><t>Nome</t></si><si><t>WhatsApp</t></si><si><t>Planilha Excel</t></si></sst>' },
      { nome: 'xl/worksheets/sheet1.xml', conteudo: `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>55${P2.replace(/^11/, '11')}</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Excel Novo</t></is></c><c r="B3"><v>11970099${sufixo}</v></c></row></sheetData></worksheet>` },
    ]).toString('base64')
  }
  if (!xlsxB64) falha('não carreguei lib/zip.ts para montar o .xlsx')
  else {
    const lido = await pB.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const fd = new FormData(); fd.append('arquivo', new File([bytes], 'excel.xlsx'))
      const r = await fetch('/api/importacao/ler', { method: 'POST', body: fd })
      return { status: r.status, json: await r.json() }
    }, xlsxB64)
    confere(lido.status === 200 && lido.json.colunas.join(',') === 'Nome,WhatsApp' && lido.json.mapa.telefone === 1, `xlsx lido, palpite do telefone (${lido.status} ${JSON.stringify(lido.json.colunas)})`)
    r = await api(pB, '/api/importacao', 'POST', { arquivo: 'excel.xlsx', linhas: lido.json.linhas, mapa: lido.json.mapa, criarLead: false, gravar: true })
    confere(r.status === 200 && r.json.contatosNovos === 1 && r.json.contatosExistentes === 1 && r.json.leadsCriados === 0, `xlsx sem lead: 1 novo, 1 já existia, 0 leads (${JSON.stringify(r.json)})`)
  }

  // ── Permissões e isolamento do histórico ────────────────────────────────────
  const pV = await entrar(E.vend_mogi)
  r = await api(pV, '/api/importacao', 'POST', { linhas: [['a', '11999998888']], mapa: { telefone: 1 }, gravar: false })
  confere(r.status === 403, `vendedor não importa (${r.status})`)
  const cA = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } })
  await cA.auth.signInWithPassword({ email: E.dono, password: SENHA })
  const { data: vistoA } = await cA.from('importacoes').select('id').eq('empresa_id', empresaB)
  confere((vistoA ?? []).length === 0, 'dono da A não lê o histórico de importação da B')

  // ── Situação em um clique ───────────────────────────────────────────────────
  const pS = await entrar(E.superadmin)
  const sit = () => sql(`select piloto||'|'||cortesia||'|'||coalesce(round(extract(epoch from trial_ends_at - now())/86400)::text,'-')||'|'||status from empresas where id=${empresaB}`)
  r = await api(pS, `/api/superadmin/empresas/${empresaB}`, 'POST', { tipo: 'situacao', situacao: 'piloto' })
  confere(r.status === 200 && sit() === 'true|false|-|ativo', `Piloto: sem fim de teste (${sit()})`)
  await pS.goto(BASE + `/superadmin/empresas/${empresaB}`, { timeout: 300000 })
  confere(await pS.locator('[data-situacao]').getAttribute('data-situacao') === 'piloto', 'tela da empresa mostra "Piloto"')
  r = await api(pS, `/api/superadmin/empresas/${empresaB}`, 'POST', { tipo: 'situacao', situacao: 'teste' })
  confere(r.status === 200 && sit() === 'false|false|14|ativo', `Teste: 14 dias a partir de agora (${sit()})`)
  r = await api(pS, `/api/superadmin/empresas/${empresaB}`, 'POST', { tipo: 'situacao', situacao: 'pagante' })
  confere(r.status === 200 && sit() === 'false|false|-|ativo', `Pagante (${sit()})`)
  r = await api(pS, `/api/superadmin/empresas/${empresaB}`, 'POST', { tipo: 'situacao', situacao: 'qualquer' })
  confere(r.status === 400, `situação inválida recusada (${r.status})`)
  await pS.reload({ timeout: 300000 })
  confere(await pS.locator('[data-situacao]').getAttribute('data-situacao') === 'pagante', 'tela recarregada mostra "Pagante"')
  await pS.getByRole('button', { name: /^Piloto/ }).click()
  await pS.waitForFunction(() => document.querySelector('[data-situacao]')?.getAttribute('data-situacao') === 'piloto', null, { timeout: 60000 })
  confere(sit() === 'true|false|-|ativo', 'botão "Piloto" na tela troca em um clique')
  const logs = sql(`select count(*) from superadmin_logs where empresa_id=${empresaB} and acao='trocar_situacao'`)
  confere(Number(logs) >= 4, `trocas no log do superadmin (${logs})`)
  await pS.goto(BASE + '/superadmin', { timeout: 300000 })
  const pil = await pS.locator('body').innerText()
  confere(/Piloto\s*\n?\s*[1-9]/.test(pil), 'visão geral conta a empresa em Piloto')

  // ── Acompanhamento ──────────────────────────────────────────────────────────
  const neg = sql(`select n.id from negocios n join contatos c on c.id=n.contato_id where c.empresa_id=${empresaB} and c.telefone_e164='+55${P2}'`)
  for (const direcao of ['recebida', 'enviada', 'enviada']) {
    const { error } = await svc.rpc('mensagem_registrar', { p_empresa: empresaB, p_canal_id: null, p_external_id: null,
      p_dados: { lead_id: Number(neg), tipo: 'texto', direcao, conteudo: 'teste e2e', origem: 'whatsapp', lida: true } })
    if (error) falha('registrar mensagem: ' + error.message)
  }
  sql(`update mensagens set status_entrega='falhou', erro_envio='131047 teste e2e' where id = (select max(id) from mensagens where empresa_id=${empresaB} and direcao='enviada')`)
  const ac = JSON.parse(sql(`select acompanhamento_empresa(${empresaB}, 14)::text`))
  const hoje = ac.dias[ac.dias.length - 1]
  confere(ac.dias.length === 14 && hoje.recebidas === 1 && hoje.enviadas === 2 && hoje.com_erro === 1 && hoje.usuarios >= 1, `acompanhamento de hoje: 1 recebida, 2 enviadas, 1 falha, usuários ${hoje.usuarios}`)
  confere(ac.falhas_recentes.length === 1 && /131047/.test(ac.falhas_recentes[0].erro), 'falha recente com o erro')
  const { error: eAnon } = await cA.rpc('acompanhamento_empresa', { p_empresa: empresaB, p_dias: 14 })
  confere(!!eAnon, `acompanhamento fechado para usuário comum (${eAnon?.code ?? 'sem erro'})`)
  await pS.goto(BASE + `/superadmin/empresas/${empresaB}`, { timeout: 300000 })
  const tAc = await pS.locator('body').innerText()
  confere(/Acompanhamento \(14 dias\)/.test(tAc) && /131047 teste e2e/.test(tAc) && /Erros da empresa no Sentry/.test(tAc), 'tela do superadmin: acompanhamento com a falha e o link do Sentry')
  const recebidasNaTela = await pS.locator('[data-acomp="Recebidas"] .num').innerText()
  confere(recebidasNaTela.trim() === '1', `recebidas no período na tela (${recebidasNaTela})`)
} catch (e) {
  falha('erro: ' + String(e?.stack ?? e).slice(0, 600))
} finally {
  if (empresaB) {
    try {
      const pS = await entrar(E.superadmin)
      const r = await api(pS, `/api/superadmin/empresas/${empresaB}/excluir`, 'DELETE', { confirmacao: NOME_B })
      if (r.status !== 200) falha(`excluir B: ${r.status} ${JSON.stringify(r.json)}`)
    } catch (e) { falha('excluir B: ' + e.message) }
  }
  sql(`delete from rate_limit where chave like 'register%'`)
  await browser.close()
  fs.rmSync(tmp, { recursive: true, force: true })
  const sobra = sql(`select count(*) from auth.users where email='${EMAIL_B}'`) + '/' + sql(`select count(*) from empresas where nome='${NOME_B}'`) + '/' + (empresaB ? sql(`select count(*) from importacoes where empresa_id=${empresaB}`) : '0')
  confere(sobra === '0/0/0', `limpeza: login, empresa e importações de B apagados (${sobra})`)
}
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
