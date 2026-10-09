/**
 * Prova o módulo de análise contra o banco de verdade, em escala pequena.
 *
 * Grava o resultado de alguns leads e confere o que foi para a tabela — antes
 * de rodar sobre os 2.039.
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

async function main() {
  // leads com conversa de verdade, das duas lojas
  const { data: amostra } = await db
    .from('leads')
    .select('id, nome, filial_id')
    .eq('empresa_id', 1).eq('ativo', true)
    .not('ultima_mensagem_at', 'is', null)
    .order('ultima_mensagem_at', { ascending: false })
    .limit(8)

  const ids = (amostra ?? []).map((l) => l.id)
  console.log(`leads de teste: ${ids.join(', ')}\n`)

  const t0 = performance.now()
  const linhas = await analisarLeads(db, 1, ids)
  const tAnalise = performance.now() - t0

  const t1 = performance.now()
  const gravadas = await gravarAnalise(db, linhas)
  const tGravar = performance.now() - t1

  console.log(`analisou ${linhas.length} em ${tAnalise.toFixed(0)}ms · gravou ${gravadas} em ${tGravar.toFixed(0)}ms\n`)

  const { data: conferir } = await db
    .from('zapintel_analise')
    .select('lead_id, filial_id, classificacao, score, perfil, urgencia, dias_inativo, total_mensagens, proxima_acao')
    .in('lead_id', ids)

  for (const r of conferir ?? []) {
    console.log(`lead ${r.lead_id} (loja ${r.filial_id}): ${r.classificacao ?? '-'} · score ${r.score} · ${r.urgencia} · ${r.total_mensagens} msgs · ${r.dias_inativo}d`)
    console.log(`   perfil: ${r.perfil ?? '-'} | ação: ${(r.proxima_acao ?? '').slice(0, 60)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
