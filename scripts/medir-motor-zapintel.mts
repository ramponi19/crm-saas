/**
 * QUANTO TEMPO O MOTOR DO ZAPINTEL LEVA PARA LER TUDO.
 *
 * Decide o desenho da análise no servidor: se couber bem dentro dos 10 s do
 * plano Hobby, uma rota resolve; se não, o cálculo precisa ser quebrado em
 * lotes ou sair para uma Edge Function.
 *
 * Não grava nada — só mede.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseCombinedCSV } from '../lib/zapintel/parser/csvParser'
import { computeStats } from '../lib/zapintel/insights/stats'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const STORE_PHONE = '5519998862028'
const HEADER = 'Contato;Arquivo;Date1;Date2;Time;UserPhone;UserName;MessageBody;MediaType;MediaLink;MediaCaption;QuotedMessage;QuotedUserName;QuotedMessageDate;QuotedMessageTime'
const limpa = (s: string) => (s || '').replace(/[\r\n;]+/g, ' ').trim()

async function main() {
  const marcos: Record<string, number> = {}
  const t = (nome: string, inicio: number) => { marcos[nome] = Math.round(performance.now() - inicio) }

  // 1. Buscar TUDO (sem teto por conversa)
  type L = {
    lead_id: number; lead_nome: string | null; lead_telefone: string | null
    lead_origem_id: string | null; direcao: string; conteudo: string | null
    tipo: string | null; created_at: string
  }

  /**
   * O teto de 1000 linhas do PostgREST vale para FUNÇÃO também.
   *
   * Descoberto aqui: a RPC devolveu exatamente 1000 de 50.856. Uma função que
   * seleciona certo no banco ainda volta cortada pela API — por isso a
   * paginação continua necessária, agora sobre um conjunto já filtrado.
   */
  let i = performance.now()
  const linhas: L[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db
      .rpc('zapintel_conversas', { p_empresa: 1, p_por_lead: 999999 })
      .range(de, de + 999)
    if (error) { console.error(error); process.exit(1) }
    const lote = (data ?? []) as L[]
    linhas.push(...lote)
    if (lote.length < 1000) break
  }
  t('1_buscar_do_banco', i)

  // 2. Montar o CSV que o parser entende
  i = performance.now()
  const rows = [HEADER]
  for (const m of linhas) {
    const contato = limpa(m.lead_nome || m.lead_telefone || m.lead_origem_id || `Lead ${m.lead_id}`)
    const dt = new Date(m.created_at)
    const date = m.created_at.slice(0, 10)
    const time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
    const enviada = m.direcao === 'enviada'
    rows.push([
      contato, `lead-${m.lead_id}`, date, date, time,
      enviada ? STORE_PHONE : limpa(m.lead_telefone || m.lead_origem_id || String(m.lead_id)),
      enviada ? 'Loja' : contato,
      limpa(m.conteudo || ''),
      m.tipo && m.tipo !== 'texto' ? m.tipo : '', '', '', '', '', '', '',
    ].join(';'))
  }
  const csv = rows.join('\n')
  t('2_montar_csv', i)

  // 3. Parser + classificação (é aqui que o motor lê tudo)
  i = performance.now()
  const leads = parseCombinedCSV(csv)
  t('3_parser_e_motor', i)

  // 4. Agregados
  i = performance.now()
  const stats = computeStats(leads)
  t('4_agregados', i)

  const total = Object.values(marcos).reduce((a, b) => a + b, 0)
  console.log('\n— TEMPOS (ms) —')
  for (const [k, v] of Object.entries(marcos)) console.log(`  ${k.padEnd(22)} ${String(v).padStart(6)} ms`)
  console.log(`  ${'TOTAL'.padEnd(22)} ${String(total).padStart(6)} ms  (${(total / 1000).toFixed(1)} s)`)
  console.log(`\n  mensagens : ${linhas.length}`)
  console.log(`  leads     : ${leads.length}`)
  console.log(`  csv       : ${(csv.length / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  resultado : ${(JSON.stringify(stats).length / 1024).toFixed(1)} KB (os agregados)`)
  const semMsgs = leads.map((l) => { const copia = { ...l } as Partial<typeof l>; delete copia.messages; return copia })
  console.log(`  por lead sem as conversas: ${(JSON.stringify(semMsgs).length / 1024).toFixed(1)} KB`)
  console.log(`\n  teto do plano Hobby: 10000 ms`)
}

main().catch((e) => { console.error(e); process.exit(1) })
