/**
 * QUANTO CUSTA MONTAR O PAINEL INTEIRO NO SERVIDOR.
 *
 * Mede o caminho real da rota `/zapintel/api/painel`: ler tudo em paralelo,
 * rodar o motor, rodar os agregados de cada loja, e pesar o que sobraria para
 * viajar. Os dois tetos a respeitar são 10 s de função e 4,5 MB de resposta.
 *
 * Não grava nada — só mede.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { montarPainel } from '../lib/zapintel/painel'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const EMPRESA = Number(process.argv[2] ?? 1)

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`

async function main() {
  const t = performance.now()
  const { painel, linhas } = await montarPainel(db, EMPRESA)
  const total = performance.now() - t

  const corpo = JSON.stringify(painel)
  const soLeads = JSON.stringify(painel.leads)
  const soAgregados = JSON.stringify(painel.agregados)

  console.log(`\nempresa ${EMPRESA} — ${painel.empresaNome}`)
  console.log(`  tempo total ......... ${(total / 1000).toFixed(1)}s   (teto da funcao: 10s)`)
  console.log(`    ler o banco ....... ${(painel.tempos.ler / 1000).toFixed(1)}s`)
  console.log(`    agregar ........... ${(painel.tempos.agregar / 1000).toFixed(1)}s`)
  console.log(`  mensagens lidas ..... ${painel.mensagens}`)
  console.log(`  leads com conversa .. ${painel.leads.length}`)
  console.log(`  leads sem conversa .. ${painel.semConversa}`)
  console.log(`  linhas a gravar ..... ${linhas.length}`)
  console.log(`\n  RESPOSTA ............ ${mb(corpo.length)}   (teto: 4,5 MB)`)
  console.log(`    os leads .......... ${kb(soLeads.length)}`)
  console.log(`    os agregados ...... ${kb(soAgregados.length)}`)

  console.log(`\n  LOJAS`)
  for (const l of painel.lojas) {
    const a = painel.agregados[l.id == null ? 'geral' : String(l.id)]
    console.log(`    ${String(l.nome).padEnd(28)} ${String(l.leads).padStart(5)} leads · ${a ? `${a.stats.total} analisados` : '—'}`)
  }

  const g = painel.agregados.geral
  console.log(`\n  CONFERINDO O GERAL`)
  console.log(`    total ............. ${g.stats.total}`)
  console.log(`    inatividade media . ${g.stats.avgDaysInactive}d`)
  console.log(`    linguagem ......... ${g.linguagem ? `${g.linguagem.winMsgs} msgs ganhas / ${g.linguagem.lossMsgs} perdidas` : '—'}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
