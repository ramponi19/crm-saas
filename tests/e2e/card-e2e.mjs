// Card do lead lendo o core — teste de ponta a ponta no app LOCAL (:3010, Supabase local).
// uso: node card-e2e.mjs <usuarios.json> <conjuntos.json> <fusao.json> <saida.json> <pasta-fotos>
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const [arqU, arqC, arqF, arqSaida, fotos] = process.argv.slice(2)
const BASE = 'http://localhost:3010'
const SENHA = 'teste-local-22'
const usuarios = JSON.parse(fs.readFileSync(arqU, 'utf8'))
const C = JSON.parse(fs.readFileSync(arqC, 'utf8'))
const F = JSON.parse(fs.readFileSync(arqF, 'utf8'))
fs.mkdirSync(fotos, { recursive: true })
const LOJA = { 3: 'Mogi', 6: 'Jaguariuna' }
const out = { api: [], ui: [], escrita: [], falhas: [] }
const falha = (m) => { out.falhas.push(m); console.log('FALHA', m) }

const browser = await chromium.launch({ channel: 'msedge', headless: true })

async function entrar(u) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push('pageerror: ' + String(e).slice(0, 160)))
  page.on('response', (r) => { if (r.status() >= 500) erros.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 120)}`) })
  await page.goto(BASE + '/login')
  await page.fill('input[type="email"]', u.email)
  await page.fill('input[type="password"]', SENHA)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')])
  return { ctx, page, erros }
}
const api = (page, url, init) => page.evaluate(async ([u, i]) => {
  const r = await fetch(u, i ? { ...i, headers: { 'Content-Type': 'application/json' } } : undefined)
  const t = await r.text()
  let j = null; try { j = JSON.parse(t) } catch {}
  return { status: r.status, bytes: t.length, j }
}, [url, init])
const loja = (page, id) => api(page, '/api/filial/selecionar', { method: 'POST', body: JSON.stringify({ filialId: id }) })

/** Abre o card pela URL e mede o que a abertura trouxe (rota do card + mensagens). */
async function abrir(page, leadId) {
  let bytes = 0
  const medir = async (r) => {
    const u = r.url()
    if (u.includes(`/api/leads/${leadId}/card`) || (u.includes('/rest/v1/mensagens') && r.request().method() === 'GET')) {
      try { bytes += (await r.body()).length } catch {}
    }
  }
  page.on('response', medir)
  await page.goto(`${BASE}/leads?lead=${leadId}`, { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForFunction(() => /hist[óo]rico de mensagens|Carregando mensagens/i.test(document.body.innerText) && !/Carregando o lead/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1500)
  page.off('response', medir)
  return page.evaluate(() => {
    const t = document.body.innerText
    const rotulo = [...document.querySelectorAll('label')].find((l) => l.textContent.trim().replace(/\s*\*$/, '') === 'Responsável')
    const resp = rotulo?.parentElement?.querySelector('select') ?? null
    return {
      abriu: /hist[óo]rico de mensagens/i.test(t),
      naoSalva: /altera[çc][ãa]o n[ãa]o salva/i.test(t),
      tambemLink: [...document.querySelectorAll('a')].filter((a) => /^também em/.test(a.innerText.trim())).map((a) => a.innerText.trim()),
      tambemTexto: [...document.querySelectorAll('span')].filter((s) => /^também em/.test(s.innerText.trim())).map((s) => s.innerText.trim()),
      fundir: [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Fundir contato'),
      responsavel: resp ? resp.value : null,
      campos: ['Nacionalidade', 'Profissão', 'Estado civil', 'Data de nascimento'].filter((r) => t.includes(r)),
    }
  }).then((r) => ({ ...r, bytes }))
}

for (const u of usuarios) {
  const { ctx, page, erros } = await entrar(u)
  const lojasDoUsuario = u.papel === 'owner' ? [3, 6] : [u.lojas[0].id]

  for (const filial of lojasDoUsuario) {
    if (u.papel === 'owner') { const r = await loja(page, filial); if (r.status !== 200) falha(`${u.nome} trocar loja ${filial}: ${r.status}`) }
    const outra = filial === 3 ? 6 : 3
    // ── A: API, os 61 contatos nas duas lojas ──
    let ok = 0, maxB = 0
    for (const c of C.duasLojas) {
      const meu = filial === 3 ? c.mogi : c.jag, deles = filial === 3 ? c.jag : c.mogi
      const r = await api(page, `/api/leads/${meu}/card`)
      maxB = Math.max(maxB, r.bytes)
      const outras = r.j?.outrasLojas ?? []
      if (r.status !== 200) falha(`${u.nome}/${LOJA[filial]} card ${meu}: ${r.status}`)
      else if (!outras.some((o) => o.filialId === outra && o.leadId === deles)) falha(`${u.nome}/${LOJA[filial]} card ${meu}: sem "também em" ${LOJA[outra]} (${JSON.stringify(outras)})`)
      else ok++
      if (u.papel !== 'owner') {
        const proibido = await api(page, `/api/leads/${deles}/card`)
        if (proibido.status !== 404) falha(`${u.nome} viu o card ${deles} da outra loja: ${proibido.status}`)
      }
    }
    // os 8 divergentes da loja
    const div = C.divergentes.filter((d) => d.filial === filial)
    let okDiv = 0
    for (const d of div) { const r = await api(page, `/api/leads/${d.id}/card`); if (r.status === 200) okDiv++; else falha(`${u.nome} divergente ${d.id}: ${r.status}`) }
    out.api.push({ usuario: u.nome, loja: LOJA[filial], duasLojasOk: `${ok}/${C.duasLojas.length}`, divergentesOk: `${okDiv}/${div.length}`, maiorCardBytes: maxB })
    console.log('API', u.nome, LOJA[filial], `${ok}/61`, `div ${okDiv}/${div.length}`, `maior ${maxB} B`)

    // ── B: UI, amostra ──
    const amostra = [
      ...C.duasLojas.slice(0, 4).map((c) => ({ id: filial === 3 ? c.mogi : c.jag, tipo: 'duas-lojas' })),
      ...div.map((d) => ({ id: d.id, tipo: 'divergente' })),
      ...C.semResponsavel.filter((s) => s.filial === filial).map((s) => ({ id: s.id, tipo: 'sem-responsavel' })),
    ]
    for (const a of amostra) {
      const r = await abrir(page, a.id)
      const linha = { usuario: u.nome, loja: LOJA[filial], lead: a.id, tipo: a.tipo, ...r }
      out.ui.push(linha)
      if (!r.abriu) falha(`${u.nome} UI ${a.id}: card não abriu`)
      if (r.naoSalva) falha(`${u.nome} UI ${a.id}: abriu como alterado`)
      if (r.bytes > 300 * 1024) falha(`${u.nome} UI ${a.id}: abertura ${r.bytes} B`)
      if (a.tipo === 'duas-lojas') {
        const tem = u.papel === 'owner' ? r.tambemLink.length : r.tambemTexto.length
        if (!tem) falha(`${u.nome} UI ${a.id}: "também em" ausente (link ${r.tambemLink} / texto ${r.tambemTexto})`)
      }
      if (a.tipo === 'sem-responsavel' && r.responsavel !== '') falha(`${u.nome} UI ${a.id}: responsável abriu preenchido (${r.responsavel})`)
      if ((u.papel === 'owner') !== r.fundir) falha(`${u.nome} UI ${a.id}: botão Fundir = ${r.fundir}`)
      if (r.campos.length !== 4) falha(`${u.nome} UI ${a.id}: campos personalizados ${JSON.stringify(r.campos)}`)
      await page.screenshot({ path: `${fotos}/${u.nome}-${LOJA[filial]}-${a.id}.png` })
      console.log('UI', u.nome, LOJA[filial], a.id, a.tipo, r.abriu ? 'abriu' : 'NAO', r.naoSalva ? 'ALTERADO' : 'limpo', `${r.bytes} B`, r.tambemLink.concat(r.tambemTexto).join('|'), r.fundir ? 'fundir' : '')
    }
  }

  // ── C: escrita (dono em Mogi; vendedor tenta fundir) ──
  if (u.papel === 'owner') {
    await loja(page, 3)
    const id = C.semResponsavel.find((s) => s.filial === 3).id
    const antes = (await api(page, `/api/leads/${id}/card`)).j
    const r1 = await api(page, `/api/leads/${id}/card`, { method: 'PATCH', body: JSON.stringify({ observacoes: 'teste e2e card', campos: { contato: { profissao: 'Testador', data_nascimento: '1990-05-17' } } }) })
    const ok1 = r1.status === 200 && r1.j.lead.observacoes === 'teste e2e card' && r1.j.campos.find((c) => c.chave === 'profissao')?.valor === 'Testador' && r1.j.campos.find((c) => c.chave === 'data_nascimento')?.valor === '1990-05-17'
    const r1b = await api(page, `/api/leads/${id}/card`, { method: 'PATCH', body: JSON.stringify({ campos: { contato: { data_nascimento: '17/05/1990' } } }) })
    const r2 = await api(page, `/api/leads/${id}/card`, { method: 'PATCH', body: JSON.stringify({ observacoes: antes.lead.observacoes ?? '', campos: { contato: { profissao: '', data_nascimento: '' } } }) })
    const ok2 = r2.status === 200 && (r2.j.lead.observacoes ?? null) === (antes.lead.observacoes ?? null) && r2.j.campos.find((c) => c.chave === 'profissao')?.valor === ''
    const etapaAntes = antes.lead.kanban_status
    const m1 = await api(page, '/api/leads/mover', { method: 'POST', body: JSON.stringify({ leadId: id, kanban_status: 'em_contato' }) })
    const depois = (await api(page, `/api/leads/${id}/card`)).j.lead.kanban_status
    const m2 = await api(page, '/api/leads/mover', { method: 'POST', body: JSON.stringify({ leadId: id, kanban_status: etapaAntes }) })
    const voltou = (await api(page, `/api/leads/${id}/card`)).j.lead.kanban_status
    const busca = await api(page, `/api/contatos/fundir?q=${encodeURIComponent('Teste Fusao IG')}&exceto=${F.contatoA}`)
    const achou = (busca.j?.contatos ?? []).some((c) => c.id === F.contatoB)
    const fz = await api(page, '/api/contatos/fundir', { method: 'POST', body: JSON.stringify({ principal: F.contatoA, removido: F.contatoB }) })
    const cardA = (await api(page, `/api/leads/${F.negocioA}/card`)).j
    out.escrita.push({ salvar: ok1, dataInvalida400: r1b.status === 400, desfazer: ok2, mover: `${m1.status} ${etapaAntes}→${depois}→${voltou}`, buscaFusao: achou, fundir: fz.status, cardAInstagram: cardA?.lead?.instagram })
    console.log('ESCRITA dono', JSON.stringify(out.escrita.at(-1)))
    if (!ok1 || r1b.status !== 400 || !ok2 || m1.status !== 200 || depois !== 'em_contato' || m2.status !== 200 || voltou !== etapaAntes || !achou || fz.status !== 200) falha('escrita do dono: ' + JSON.stringify(out.escrita.at(-1)))
  } else {
    const fz = await api(page, '/api/contatos/fundir', { method: 'POST', body: JSON.stringify({ principal: 1, removido: 2 }) })
    if (fz.status !== 403) falha(`${u.nome} fundir sem permissão deu ${fz.status}`)
    const lid = u.lojas[0].lead
    const etapaAntes = (await api(page, `/api/leads/${lid}/card`)).j?.lead?.kanban_status
    const alvo = etapaAntes === 'em_contato' ? 'novo' : 'em_contato'
    const mv = await api(page, '/api/leads/mover', { method: 'POST', body: JSON.stringify({ leadId: lid, kanban_status: alvo }) })
    const meio = (await api(page, `/api/leads/${lid}/card`)).j?.lead?.kanban_status
    const mv2 = await api(page, '/api/leads/mover', { method: 'POST', body: JSON.stringify({ leadId: lid, kanban_status: etapaAntes }) })
    const fim = (await api(page, `/api/leads/${lid}/card`)).j?.lead?.kanban_status
    out.escrita.push({ usuario: u.nome, fundirSemPermissao: fz.status, mover: `${mv.status}/${mv2.status} ${etapaAntes}→${meio}→${fim}` })
    if (mv.status !== 200 || meio !== alvo || mv2.status !== 200 || fim !== etapaAntes) falha(`${u.nome} mover: ${out.escrita.at(-1).mover}`)
    console.log('ESCRITA', u.nome, JSON.stringify(out.escrita.at(-1)))
  }
  if (erros.length) { falha(`${u.nome} erros de página: ${erros.slice(0, 5).join(' | ')}`) }
  await ctx.close()
}
await browser.close()
fs.writeFileSync(arqSaida, JSON.stringify(out, null, 1))
console.log(`FIM: ${out.falhas.length} falha(s)`)
