// Perda pelo quadro: a justificativa é emendada às observações (não as apaga). LOCAL.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const dono = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).find((u) => u.papel === 'owner')
const leadId = Number(process.argv[3])
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await browser.newContext()).newPage()
await page.goto('http://localhost:3010/login')
await page.fill('input[type="email"]', dono.email)
await page.fill('input[type="password"]', 'teste-local-22')
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button[type="submit"]')])
const r = await page.evaluate(async (id) => {
  const j = (u, m, b) => fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }))
  await j('/api/filial/selecionar', 'POST', { filialId: 3 })
  const antes = (await j(`/api/leads/${id}/card`, 'GET')).j.lead
  await j(`/api/leads/${id}/card`, 'PATCH', { observacoes: 'linha que já estava lá' })
  const mv = await j('/api/leads/mover', 'POST', { leadId: id, kanban_status: 'perdido', motivo_perda_id: 1, perdido_em: new Date().toISOString(), justificativa: 'cliente comprou em outro lugar' })
  const depois = (await j(`/api/leads/${id}/card`, 'GET')).j.lead
  await j('/api/leads/mover', 'POST', { leadId: id, kanban_status: antes.kanban_status })
  await j(`/api/leads/${id}/card`, 'PATCH', { observacoes: antes.observacoes ?? '' })
  const fim = (await j(`/api/leads/${id}/card`, 'GET')).j.lead
  return { mover: mv.s, status: depois.kanban_status, obs: depois.observacoes, voltou: fim.kanban_status === antes.kanban_status && (fim.observacoes ?? null) === (antes.observacoes ?? null) }
}, leadId)
console.log(JSON.stringify(r))
await browser.close()
