/**
 * QUANTO CUSTA RECALCULAR **UM** LEAD.
 *
 * Decide se o ZapIntel pode se atualizar em tempo real: quando chega uma
 * mensagem, só a conversa dela muda. Se recalcular um lead for barato, a tela
 * acompanha o movimento da loja sem reprocessar nada além do necessário.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseCombinedCSV } from '../lib/zapintel/parser/csvParser'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const STORE_PHONE = '5519998862028'
const HEADER = 'Contato;Arquivo;Date1;Date2;Time;UserPhone;UserName;MessageBody;MediaType;MediaLink;MediaCaption;QuotedMessage;QuotedUserName;QuotedMessageDate;QuotedMessageTime'
const limpa = (s: string) => (s || '').replace(/[\r\n;]+/g, ' ').trim()

async function recalcularUm(leadId: number) {
  const t0 = performance.now()

  const { data: msgs } = await db
    .from('lead_mensagens')
    .select('direcao, conteudo, tipo, created_at, leads!inner(nome, telefone, origem_id, filial_id)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  const tBusca = performance.now() - t0
  const linhas = (msgs ?? []) as Array<Record<string, unknown>>
  if (!linhas.length) return null

  const t1 = performance.now()
  const lead = (linhas[0].leads ?? {}) as { nome?: string; telefone?: string; origem_id?: string }
  const contato = limpa(lead.nome || lead.telefone || lead.origem_id || `Lead ${leadId}`)

  const rows = [HEADER]
  for (const m of linhas) {
    const criado = m.created_at as string
    const dt = new Date(criado)
    const enviada = m.direcao === 'enviada'
    rows.push([
      contato, `lead-${leadId}`, criado.slice(0, 10), criado.slice(0, 10),
      `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
      enviada ? STORE_PHONE : limpa(lead.telefone || lead.origem_id || String(leadId)),
      enviada ? 'Loja' : contato,
      limpa((m.conteudo as string) || ''),
      m.tipo && m.tipo !== 'texto' ? (m.tipo as string) : '', '', '', '', '', '', '',
    ].join(';'))
  }
  const analisado = parseCombinedCSV(rows.join('\n'))[0]
  const tMotor = performance.now() - t1

  return { mensagens: linhas.length, tBusca, tMotor, total: tBusca + tMotor, lead: analisado }
}

async function main() {
  // três conversas de tamanhos diferentes, para ver como o custo escala
  const { data: amostra } = await db.rpc('zapintel_conversas', { p_empresa: 1, p_por_lead: 1 }).range(0, 2)
  const ids = [...new Set(((amostra ?? []) as Array<{ lead_id: number }>).map((r) => r.lead_id))]

  console.log('— RECÁLCULO DE UM LEAD —\n')
  for (const id of ids) {
    const r = await recalcularUm(id)
    if (!r) continue
    console.log(`lead ${id}: ${r.mensagens} msgs | banco ${r.tBusca.toFixed(0)}ms | motor ${r.tMotor.toFixed(1)}ms | total ${r.total.toFixed(0)}ms`)
    console.log(`   score ${r.lead?.score} · ${r.lead?.urgency} · ${r.lead?.daysInactive}d inativo`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
