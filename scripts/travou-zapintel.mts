/**
 * ONDE AS CONVERSAS TRAVARAM — a distribuição e as amostras.
 *
 * O ponto marcado dentro da conversa só vale se apontar para a mensagem CERTA.
 * Isso não se verifica lendo o código: verifica-se lendo o que ele aponta em
 * conversas reais, inclusive as feias. Por isso o script imprime, para cada
 * tipo, a mensagem marcada junto das duas que vêm antes e depois — é o
 * contexto mínimo para alguém dizer "sim, foi aí" ou "não, errou".
 *
 *     npx tsx scripts/travou-zapintel.mts [empresaId]
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { carregarConversas } from '../lib/zapintel/conversas'
import { ondeTravou, type Travou, type TipoDeTravamento } from '../lib/zapintel/travou'
import type { Lead } from '../types/zapintel'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const EMPRESA = Number(process.argv[2] ?? 1)

const { analisados } = await carregarConversas(db, EMPRESA)

const { data: ponteRaw } = await db
  .from('zapintel_venda_lead').select('lead_id')
  .eq('empresa_id', EMPRESA).not('lead_id', 'is', null)
const comprou = new Set((ponteRaw ?? []).map((p) => p.lead_id as number))

const achados: { lead: Lead; t: Travou }[] = []
let semPonto = 0
let compradores = 0

for (const a of analisados) {
  const id = a.crm?.leadId ?? null
  const ehComprador = id != null && comprou.has(id)
  if (ehComprador) compradores++
  const t = ondeTravou(a, ehComprador)
  if (t) achados.push({ lead: a, t })
  else if (!ehComprador) semPonto++
}

// Os SEM PONTO importam tanto quanto os com: se metade da base nao recebe
// marca nenhuma, a tela so serve para metade dos leads, e e melhor saber por
// que antes de construir a tela.
const orfaos: Lead[] = []
for (const a of analisados) {
  const id = a.crm?.leadId ?? null
  if (id != null && comprou.has(id)) continue
  if (!ondeTravou(a, false)) orfaos.push(a)
}

const porTipo = new Map<TipoDeTravamento, number>()
for (const { t } of achados) porTipo.set(t.tipo, (porTipo.get(t.tipo) ?? 0) + 1)

console.log(`\nconversas ................ ${analisados.length}`)
console.log(`compradores (sem ponto) .. ${compradores}`)
console.log(`com ponto de travamento .. ${achados.length}`)
console.log(`sem ponto, sem compra .... ${semPonto}\n`)

for (const [tipo, n] of [...porTipo].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${tipo}  (${((n / achados.length) * 100).toFixed(1)}%)`)
}

// As objeções que mais travam, medidas no PONTO e não na conversa inteira.
const porObjecao = new Map<string, number>()
for (const { t } of achados) if (t.objecao) porObjecao.set(t.objecao, (porObjecao.get(t.objecao) ?? 0) + 1)
if (porObjecao.size) {
  console.log('\nobjeção no ponto de travamento:')
  for (const [o, n] of [...porObjecao].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${o}`)
  }
}

const corta = (s: string, n = 110) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n)

// Uma amostra de CADA tipo, com o contexto em volta da mensagem marcada.
for (const tipo of porTipo.keys()) {
  const amostra = achados.filter(({ t }) => t.tipo === tipo).slice(0, 2)
  console.log(`\n${'═'.repeat(74)}\n${tipo.toUpperCase()}`)
  for (const { lead, t } of amostra) {
    console.log(`\n  lead ${lead.crm?.leadId} · ${lead.contact} · ${lead.messages.length} msgs`)
    console.log(`  ▸ ${t.rotulo} (${t.detalhe})`)
    const de = Math.max(0, t.indice - 2)
    const ate = Math.min(lead.messages.length - 1, t.indice + 2)
    for (let i = de; i <= ate; i++) {
      const m = lead.messages[i]
      const marca = i === t.indice ? '►' : ' '
      const quem = m.isStore ? 'LOJA ' : 'ele  '
      console.log(`   ${marca} ${quem} ${m.date} ${m.time}  ${corta(m.body || `[${m.mediaType}]`)}`)
    }
  }
}

// Por que os orfaos ficaram sem marca.
const motivo = new Map<string, number>()
for (const a of orfaos) {
  const m = a.messages || []
  const ultima = [...m].reverse().find((x) => (x.body || '').trim() || x.mediaType)
  const k = m.length < 2 ? 'conversa de 1 mensagem'
    : !ultima ? 'sem mensagem legivel'
    : !ultima.isStore ? 'ultima e dele (deveria ter marcado!)'
    : 'loja falou por ultimo, mas fora da janela de 24h (retomada)'
  motivo.set(k, (motivo.get(k) ?? 0) + 1)
}
console.log(`
os ${orfaos.length} sem ponto:`)
for (const [k, n] of [...motivo].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${k}`)
}

console.log('')
