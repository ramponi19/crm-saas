/**
 * CARGA COMPLETA da análise do ZapIntel — a primeira vez.
 *
 * Roda o mesmo caminho da rota (`lib/zapintel/analise`), em lotes, e mede cada
 * um. Depois disto a tabela se mantém sozinha pelo incremental: ~120 ms por
 * lead quando chega mensagem.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { analisarLeads, gravarAnalise } from '../lib/zapintel/analise'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const EMPRESA = Number(process.argv[2] ?? 1)
const LOTE = 300

async function main() {
  console.log(`carga da empresa ${EMPRESA}, lotes de ${LOTE}\n`)
  let desde = 0
  let total = 0
  let lote = 0
  const tempos: number[] = []
  const inicio = performance.now()

  for (;;) {
    const { data: pagina } = await db.from('leads').select('id')
      .eq('empresa_id', EMPRESA).eq('ativo', true)
      .gt('id', desde).order('id', { ascending: true }).limit(LOTE)

    const ids = (pagina ?? []).map((l) => l.id as number)
    if (!ids.length) break

    const t = performance.now()
    const linhas = await analisarLeads(db, EMPRESA, ids)
    const gravadas = await gravarAnalise(db, linhas)
    const ms = performance.now() - t
    tempos.push(ms)

    lote++
    total += gravadas
    desde = ids[ids.length - 1]
    console.log(`  lote ${lote}: ${gravadas} leads em ${(ms / 1000).toFixed(1)}s  (até id ${desde})`)

    if (ids.length < LOTE) break
  }

  const totalS = (performance.now() - inicio) / 1000
  const pior = Math.max(...tempos) / 1000
  console.log(`\n${total} leads em ${totalS.toFixed(1)}s`)
  console.log(`pior lote: ${pior.toFixed(1)}s  (teto da função: 10s)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
