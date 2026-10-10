/**
 * MONTA A PONTE VENDA → CONVERSA E MOSTRA O QUE ELA REVELA.
 *
 * Primeiro passo da reconstrução analítica do ZapIntel. Até aqui o painel
 * afirmava coisas sobre venda sem ter uma única venda dentro da conta: o
 * "PIPELINE R$ 1,2M" sai de `TICKET_MEDIO = 5200` escrito à mão, e a "TAXA DE
 * CONVERSÃO 6%" sai de uma regra que marca cliente por palavra — inclusive
 * palavra que a LOJA falou.
 *
 * Isto liga as duas pontas e imprime os números REAIS lado a lado com os que
 * a tela mostra hoje, para a diferença ficar visível antes de qualquer tela
 * ser mexida.
 *
 *     npx tsx scripts/ponte-zapintel.mts [empresaId] [--gravar]
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { montarPonte, gravarPonte } from '../lib/zapintel/ponte'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const EMPRESA = Number(process.argv[2] ?? 1)
const GRAVAR = process.argv.includes('--gravar')
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const t0 = Date.now()
const linhas = await montarPonte(db, EMPRESA)
console.log(`ponte montada em ${Date.now() - t0} ms — ${linhas.length} vendas\n`)

const por = (c: string) => linhas.filter((l) => l.como === c)
console.log('COMO CADA VENDA CASOU')
for (const c of ['telefone', 'telefone_multiplo', 'sem_conversa', 'sem_telefone', 'manual']) {
  const n = por(c).length
  if (n) console.log(`  ${c.padEnd(18)} ${String(n).padStart(3)}  (${Math.round((n / linhas.length) * 100)}%)`)
}

const ligadas = linhas.filter((l) => l.lead_id != null)
const ciclos = ligadas.map((l) => l.dias_ate_venda).filter((d): d is number => d != null).sort((a, b) => a - b)
const mediana = ciclos.length ? ciclos[Math.floor(ciclos.length / 2)] : null

// ── Os números reais, contra os que a tela mostra hoje ──────────────────────
const { data: vendas } = await db
  .from('vendas').select('id, valor_venda, status')
  .eq('empresa_id', EMPRESA)
const concluidas = (vendas ?? []).filter((v) => v.status === 'concluida')
const total = concluidas.reduce((s, v) => s + Number(v.valor_venda ?? 0), 0)
const ticket = concluidas.length ? total / concluidas.length : 0

const { count: leadsAtivos } = await db
  .from('leads').select('id', { count: 'exact', head: true })
  .eq('empresa_id', EMPRESA).eq('ativo', true)

const leadsQueCompraram = new Set(ligadas.map((l) => l.lead_id)).size

console.log('\nO QUE A PONTE REVELA')
console.log(`  vendas concluidas ....... ${concluidas.length}`)
console.log(`  faturamento ............. ${brl(total)}`)
console.log(`  ticket REAL ............. ${brl(ticket)}       (a tela usa TICKET_MEDIO = ${brl(5200)}, escrito a mao)`)
console.log(`  conversas que viraram venda . ${leadsQueCompraram}`)
console.log(`  leads ativos ............ ${leadsAtivos}`)
console.log(`  conversao REAL .......... ${((leadsQueCompraram / (leadsAtivos || 1)) * 100).toFixed(1)}%   (a tela mostra 6%, de uma regra que le a fala da loja)`)
if (mediana != null) {
  console.log(`  ciclo REAL (mediana) .... ${mediana} dias     (a tela mostra "TEMPO P/ FECHAR 16d", sem venda na conta)`)
  console.log(`  ciclo: min ${ciclos[0]}d · p25 ${ciclos[Math.floor(ciclos.length * 0.25)]}d · p75 ${ciclos[Math.floor(ciclos.length * 0.75)]}d · max ${ciclos[ciclos.length - 1]}d`)
}

if (GRAVAR) {
  const n = await gravarPonte(db, linhas)
  console.log(`\ngravadas ${n} linhas em zapintel_venda_lead`)
} else {
  console.log('\n(nada gravado — rode com --gravar)')
}
