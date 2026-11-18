// SMOKE EM PRODUÇÃO do piloto (18/11/2026): conta de teste pela API do app (senha gerada aqui, nada
// digitado em página), sessão como cookie do @supabase/ssr, e as rotas de verdade: página de importação,
// leitura da planilha, prévia, gravação e lead com "Produto de interesse". Imprime o id da empresa para
// conferir no banco e apagar no fim (apagar é com o service role, fora deste script).
//
//   node tests/e2e/smoke-piloto-producao.mjs
import crypto from 'node:crypto'
import { createServerClient } from '@supabase/ssr'

const BASE = 'https://crm-saas-beta.vercel.app'
const SUPA = 'https://guiuzbcqkvelqcuogxtd.supabase.co'
const ANON = 'sb_publishable_Qo89YhOVu-yHjx1eoqAKGw_CHmlIp7Z'
const T = Date.now()
const EMAIL = `smoke-piloto-${T}@e2e.test`
const SENHA = crypto.randomBytes(18).toString('base64url')
let falhas = 0
const confere = (c, m) => { console.log((c ? 'ok   ' : 'FALHA ') + m); if (!c) falhas++ }

const reg = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
  email: EMAIL, password: SENHA, nomeUsuario: 'Smoke Piloto', nomeEmpresa: `Smoke Piloto ${T}`, telefone: '11999990000', aceite: true }) })
const regJ = await reg.json().catch(() => ({}))
confere(reg.status === 200 && regJ.empresaId, `cadastro pela API: ${reg.status} empresa ${regJ.empresaId}`)
console.log(`EMPRESA=${regJ.empresaId} EMAIL=${EMAIL}`)

// Sessão no formato do app (cookies do @supabase/ssr).
const jar = new Map()
const sb = createServerClient(SUPA, ANON, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach((c) => jar.set(c.name, c.value)) } })
const { error: eLogin } = await sb.auth.signInWithPassword({ email: EMAIL, password: SENHA })
confere(!eLogin && jar.size > 0, `sessão por API (${eLogin?.message ?? jar.size + ' cookie(s)'})`)
const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join('; ')
const req = (url, init = {}) => fetch(BASE + url, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie } })

const pag = await req('/configuracoes/importar')
const html = await pag.text()
confere(pag.status === 200 && html.includes('Importar contatos'), `página Configurações → Importar contatos (${pag.status})`)

const csv = '﻿Nome;Celular;Interesse;Valor\r\nSmoke Um;11970011234;Modelo A;R$ 1.500,00\r\nSmoke Dois;(11) 97002-1234;;\r\nSem Fone;;;\r\n'
const fd = new FormData(); fd.append('arquivo', new Blob([csv], { type: 'text/csv' }), 'smoke.csv')
const ler = await req('/api/importacao/ler', { method: 'POST', body: fd })
const lerJ = await ler.json().catch(() => ({}))
confere(ler.status === 200 && lerJ.mapa?.telefone === 1 && lerJ.linhas?.length === 3, `leitura do CSV e palpite do telefone (${ler.status})`)

const corpo = (gravar) => JSON.stringify({ arquivo: 'smoke.csv', linhas: lerJ.linhas, mapa: lerJ.mapa, criarLead: true, gravar })
const prev = await req('/api/importacao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: corpo(false) })
const prevJ = await prev.json().catch(() => ({}))
confere(prev.status === 200 && prevJ.contatosNovos === 2 && prevJ.recusadas?.length === 1, `prévia: 2 novos, 1 recusada (${prev.status} ${prevJ.contatosNovos}/${prevJ.recusadas?.length})`)
const grav = await req('/api/importacao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: corpo(true) })
const gravJ = await grav.json().catch(() => ({}))
confere(grav.status === 200 && gravJ.contatosNovos === 2 && gravJ.leadsCriados === 2, `gravação: 2 contatos e 2 leads (${grav.status} ${JSON.stringify(gravJ).slice(0, 160)})`)

const lead = await req('/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: 'Smoke Lead', telefone: '11970031234', produto_interessado: 'Modelo B' }) })
confere(lead.status === 200, `novo lead com "Produto de interesse" na empresa nova (${lead.status})`)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK')
process.exit(falhas ? 1 : 0)
