/**
 * MOSTRA AS FICHAS — para julgar o relato antes de guardar qualquer coisa.
 *
 * A ficha só presta se, lida sozinha, disser o que aconteceu na conversa. O
 * jeito de saber isso não é inspecionar o código: é ler o que ele produz sobre
 * conversas reais, inclusive as feias. Por isso este script imprime amostras de
 * TIPOS diferentes — quem comprou, quem sumiu, quem a loja deixou no vácuo —
 * em vez dos primeiros N.
 *
 *     npx tsx scripts/ficha-zapintel.mts [empresaId]
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { carregarConversas, idDoLead } from '../lib/zapintel/conversas'
import { montarFicha, type Ficha } from '../lib/zapintel/ficha'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const EMPRESA = Number(process.argv[2] ?? 1)

const t0 = Date.now()
const { analisados, porId } = await carregarConversas(db, EMPRESA)

const { data: ponteRaw } = await db
  .from('zapintel_venda_lead').select('lead_id, dias_ate_venda, venda_id')
  .eq('empresa_id', EMPRESA).not('lead_id', 'is', null)
const { data: vendasRaw } = await db
  .from('vendas').select('id, valor_venda').eq('empresa_id', EMPRESA)

const valorDaVenda = new Map((vendasRaw ?? []).map((v) => [v.id as number, Number(v.valor_venda ?? 0)]))
const compra = new Map<number, { valor: number | null; dias: number | null }>()
for (const p of ponteRaw ?? []) {
  compra.set(p.lead_id as number, {
    valor: valorDaVenda.get(p.venda_id as number) ?? null,
    dias: (p.dias_ate_venda as number | null) ?? null,
  })
}

const fichas: Ficha[] = []
for (const a of analisados) {
  const id = idDoLead(a)
  const lead = id != null ? porId.get(id) : undefined
  if (!lead) continue
  const c = compra.get(lead.id)
  fichas.push(montarFicha(a, {
    leadId: lead.id,
    filialId: lead.filial_id,
    canal: lead.origem ?? 'whatsapp',
    comprou: !!c,
    valorVenda: c?.valor ?? null,
    diasAteVenda: c?.dias ?? null,
  }))
}

console.log(`${fichas.length} fichas montadas em ${Date.now() - t0} ms\n`)

const mostrar = (titulo: string, lista: Ficha[], n = 3) => {
  console.log(`\n${'='.repeat(74)}\n${titulo}  (${lista.length} no total)\n${'='.repeat(74)}`)
  for (const f of lista.slice(0, n)) {
    console.log(`\nlead ${f.leadId} · ${f.contato} · ${f.canal} · vendedor ${f.vendedor ?? '?'}`)
    console.log(`  ${f.relato}`)
    console.log(`  [${f.mensagensLead} dele / ${f.mensagensLoja} da loja · ${f.trocasDeTurno} trocas · `
      + `monologo loja ${f.monologoLoja} / cliente ${f.monologoLead} · ${f.perguntasDaLoja} perguntas da loja · `
      + `resposta mediana ${f.respostaMedianaMin ?? '-'} min, pior ${f.respostaPiorMin ?? '-'} min]`)
  }
}

mostrar('COMPRARAM', fichas.filter((f) => f.comprou))
mostrar('A LOJA FALOU POR ULTIMO E O CLIENTE SUMIU', fichas.filter((f) => f.fraseAntesDoSilencio && f.diasInativo > 7 && f.mensagensLead >= 3))
mostrar('O CLIENTE FALOU POR ULTIMO E A LOJA NAO VOLTOU', fichas.filter((f) => f.aguardandoLoja && f.diasInativo > 7 && f.mensagensLead >= 3))
mostrar('CONVERSA CURTA (o relato nao pode inventar)', fichas.filter((f) => f.mensagensLead + f.mensagensLoja <= 3))

// ── O que so a ficha responde: quais frases precedem o silencio ─────────────
const normalizar = (s: string) => s.toLowerCase()
  .replace(/[0-9]+/g, '#').replace(/[^\p{L}\s#]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)

const porFrase = new Map<string, { n: number; exemplo: string }>()
for (const f of fichas) {
  if (!f.fraseAntesDoSilencio || f.diasInativo <= 7) continue
  const k = normalizar(f.fraseAntesDoSilencio)
  if (k.length < 12) continue
  const d = porFrase.get(k) ?? { n: 0, exemplo: f.fraseAntesDoSilencio }
  d.n++
  porFrase.set(k, d)
}

console.log(`\n${'='.repeat(74)}\nFRASES QUE MAIS PRECEDERAM SILENCIO (correlacao, nao causa)\n${'='.repeat(74)}`)
for (const [, d] of [...porFrase.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
  console.log(`  ${String(d.n).padStart(3)}x  "${d.exemplo.slice(0, 90)}"`)
}
