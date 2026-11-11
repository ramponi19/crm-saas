// "ESPERANDO RESPOSTA" ANTES × DEPOIS, POR TELA (11/11/2026). Banco LOCAL (cópia da produção), JM.
// Mede, com o login do Eduardo (admin da JM, RLS dele), quantos "esperando resposta" cada tela mostra:
//   painel do ZapIntel (rede e por loja), Assistente (leads_buscar esperando_loja), Comunicação (filtro
//   "aguardando") e o contador do topo do quadro (funil padrão).
// Roda uma vez ANTES da migração 20261111000200 e outra DEPOIS; a segunda imprime a tabela comparando.
//   node --import ./tests/alias.mjs tests/e2e/esperando-antes-depois.mts antes
//   (aplicar a migração no local)
//   node --import ./tests/alias.mjs tests/e2e/esperando-antes-depois.mts depois
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { aguardandoResposta } from '@/lib/inbox/consultas'
import { conversaEsperando, mapaDoEsperando, type Esperando } from '@/lib/esperando'

const fase = process.argv[2]
if (fase !== 'antes' && fase !== 'depois') throw new Error('uso: antes | depois')
const env = Object.fromEntries(readFileSync('tests/e2e/status.local.env', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^(\w+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m![1], m![2]]))
if (!/127\.0\.0\.1|localhost/.test(env.API_URL)) throw new Error('RECUSADO: não é o banco local')

const EDUARDO = 'dea818d4-f6fb-494d-8346-1462986b0828'
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const corpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: EDUARDO, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`
const jwt = `${corpo}.${createHmac('sha256', env.JWT_SECRET).update(corpo).digest('base64url')}`
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const db = createClient(env.API_URL, env.ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${jwt}` } } })
const svc = createClient(env.API_URL, env.SERVICE_ROLE_KEY, opts)

const ok = <T,>(r: { data: T; error: { message: string } | null }, onde: string): T => {
  if (r.error) throw new Error(`${onde}: ${r.error.message}`)
  return r.data
}
const { data: lojas } = await svc.from('filiais').select('id, nome, cidade').eq('empresa_id', 1).order('id')
const rotulo = (f: { nome: string; cidade: string | null }) => f.cidade?.trim() || f.nome
const vis = ok(await db.rpc('filiais_visiveis'), 'filiais_visiveis') as number[]
console.log(`fase: ${fase} · lojas que o Eduardo vê agora (filial_atual): ${JSON.stringify(vis)}`)

const medidas: Record<string, number | string> = {}

// 1. Painel do ZapIntel — rede e cada loja
for (const f of [null, ...(lojas ?? []).map((l) => l.id as number)]) {
  const d = ok(await db.rpc('zapintel_dashboard', { p_filial: f, p_empresa: 1 }), 'dashboard') as { agora: Record<string, number> }
  const nome = f == null ? 'rede' : rotulo((lojas ?? []).find((l) => l.id === f)!)
  medidas[`painel · ${nome} · esperando`] = d.agora.esperando
  medidas[`painel · ${nome} · candidatos à parte`] = d.agora.esperandoForaDoFunil
  medidas[`painel · ${nome} · há mais de 1 h`] = d.agora.esperandoMais1h
}
// a lista do card (clicar em "esperando") tem de bater com o número
{
  const l = ok(await db.rpc('zapintel_dashboard_lista', { p_tipo: 'esperando', p_empresa: 1 }), 'dashboard_lista') as { leads?: unknown[]; total?: number } | unknown[]
  medidas['painel · rede · lista do card'] = Array.isArray(l) ? l.length : (l.total ?? l.leads?.length ?? -1)
  const ll = ok(await db.rpc('zapintel_leads_lista', { p_filtros: { esperando: true }, p_empresa: 1, p_por_pagina: 500 }), 'leads_lista') as { total: number }
  medidas['lista de leads do ZapIntel · filtro esperando'] = ll.total
}

// 2. Assistente — o que leads_buscar(esperando_loja) contaria: status com esperando, cruzado com os leads visíveis
{
  const st = ok(await svc.rpc('assistente_status_leads', { p_empresa: 1, p_esperando: true }), 'status') as unknown[][]
  medidas['Assistente · esperando (rede)'] = st.length
}

// 3. Comunicação — filtro "aguardando" (RLS do Eduardo)
{
  const convs: { contato_id: number | null; filial_id: number | null; ultima_recebida_at: string | null; ultima_enviada_at: string | null }[] = []
  for (let de = 0; ; de += 1000) {
    const r = ok(await db.from('conversas').select('contato_id, filial_id, ultima_recebida_at, ultima_enviada_at')
      .not('ultima_mensagem_at', 'is', null).order('id').range(de, de + 999), 'conversas')
    convs.push(...(r as typeof convs))
    if ((r as unknown[]).length < 1000) break
  }
  if (fase === 'antes') {
    medidas['Comunicação · aguardando'] = convs.filter((c) => aguardandoResposta(c)).length
  } else {
    const mapa = mapaDoEsperando(ok(await db.rpc('esperando_resposta_visiveis'), 'visiveis') as Esperando[])
    medidas['Comunicação · aguardando'] = convs.filter((c) => conversaEsperando(c, mapa)).length
  }
}

// 4. Quadro — contador do topo, funil padrão
{
  const { data: funil } = await svc.from('funis').select('id').eq('empresa_id', 1).eq('padrao', true).order('nome').limit(1).maybeSingle()
  const c = ok(await db.rpc('quadro_contagens', { p_funil: funil?.id ?? null }), 'quadro') as { etapas: Record<string, { aguardando: number }> }
  medidas['quadro · topo (funil padrão)'] = Object.values(c.etapas).reduce((s, e) => s + e.aguardando, 0)
}

// 5. Depois: a função única é a fonte — o painel da rede, o quadro e a Comunicação têm de bater com ela.
if (fase === 'depois') {
  const todos = ok(await svc.rpc('esperando_resposta', { p_empresa: 1 }), 'esperando_resposta') as Esperando[]
  medidas['função única · rede (sem os à parte)'] = todos.filter((e) => !e.a_parte).length
  medidas['função única · à parte'] = todos.filter((e) => e.a_parte).length
  const iguais = medidas['função única · rede (sem os à parte)'] === medidas['painel · rede · esperando']
  console.log(iguais ? 'ok   painel da rede = função única' : 'FALHA painel da rede ≠ função única')
}

mkdirSync('.gate', { recursive: true })
writeFileSync(`.gate/esperando-${fase}.json`, JSON.stringify(medidas, null, 2))
if (fase === 'depois' && existsSync('.gate/esperando-antes.json')) {
  const antes = JSON.parse(readFileSync('.gate/esperando-antes.json', 'utf8')) as Record<string, number>
  console.log('\n| tela | antes | depois |\n|---|---|---|')
  for (const k of Object.keys(medidas)) console.log(`| ${k} | ${antes[k] ?? '—'} | ${medidas[k]} |`)
} else {
  console.log(medidas)
}
