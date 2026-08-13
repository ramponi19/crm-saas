import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { mapCrmSegmento } from '@/lib/zapintel/segments/segments'

/**
 * Adaptador ZapIntel: transforma as conversas reais do CRM (lead_mensagens) no
 * CSV combinado que o parser do ZapIntel já entende — assim o engine roda 100%
 * igual, mas sobre os dados reais. Mensagem enviada = loja (STORE_PHONE que o
 * parser reconhece como isStore).
 */
export const dynamic = 'force-dynamic'

// Precisa bater com STORE_PHONE do lib/zapintel/parser/csvParser.ts
const STORE_PHONE = '5519998862028'
const HEADER = 'Contato;Arquivo;Date1;Date2;Time;UserPhone;UserName;MessageBody;MediaType;MediaLink;MediaCaption;QuotedMessage;QuotedUserName;QuotedMessageDate;QuotedMessageTime'

const limpa = (s: string) => (s || '').replace(/[\r\n;]+/g, ' ').trim()

// O PostgREST do Supabase limita cada request a 1000 linhas — `.limit(20000)` NÃO
// vence esse teto. Sem paginar, vinham só as 1000 mensagens MAIS ANTIGAS (ordem
// ascendente) e as conversas recentes sumiam. Aqui buscamos em páginas de 1000
// até esgotar (ou o teto de segurança), preservando a ordem cronológica estável.
async function pageAll<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, max = 40000): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1)
    if (error) { console.error('pageAll:', (error as { message?: string })?.message); break }
    const chunk = (data ?? []) as T[]
    out.push(...chunk)
    if (chunk.length < PAGE) break
  }
  return out
}

type L = { id: number; nome: string | null; telefone: string | null; origem_id: string | null }
type Msg = { lead_id: number; direcao: string; conteudo: string | null; tipo: string | null; created_at: string }

export async function GET() {
  const { empresaId } = await zapintelEmpresa()
  const db = rastrDb()

  const { data: empresa } = await db.from('empresas').select('nome, segmento').eq('id', empresaId).maybeSingle()

  // Paginado por chave estável para não perder nem duplicar no limite de 1000.
  const [leadsRaw, msgsRaw] = await Promise.all([
    pageAll<L>((from, to) => db.from('leads')
      .select('id, nome, telefone, origem_id')
      .eq('empresa_id', empresaId).eq('ativo', true)
      .order('id', { ascending: true }).range(from, to)),
    pageAll<Msg>((from, to) => db.from('lead_mensagens')
      .select('lead_id, direcao, conteudo, tipo, created_at')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
  ])

  // Nome real da empresa rotula o lado "loja" (antes era fixo "JM Store").
  const storeName = limpa((empresa?.nome as string) || 'Loja') || 'Loja'
  // Segmento vem direto do cadastro da empresa no CRM — sem escolha no ZapIntel.
  const segmentId = mapCrmSegmento((empresa as { segmento?: string } | null)?.segmento)

  const leadMap = new Map<number, L>()
  for (const l of leadsRaw) leadMap.set(l.id, l)

  const rows: string[] = [HEADER]
  let n = 0
  for (const m of msgsRaw) {
    const lead = leadMap.get(m.lead_id)
    if (!lead) continue
    const contato = limpa(lead.nome || lead.telefone || lead.origem_id || `Lead ${m.lead_id}`)
    const arquivo = `lead-${m.lead_id}`
    const dt = new Date(m.created_at)
    const date = m.created_at.slice(0, 10)
    const time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
    const enviada = m.direcao === 'enviada'
    const userphone = enviada ? STORE_PHONE : limpa(lead.telefone || lead.origem_id || String(m.lead_id))
    const username = enviada ? storeName : contato
    const body = limpa(m.conteudo || '')
    const mediaType = m.tipo && m.tipo !== 'texto' ? m.tipo : ''
    rows.push([contato, arquivo, date, date, time, userphone, username, body, mediaType, '', '', '', '', '', ''].join(';'))
    n++
  }

  return NextResponse.json({ csv: rows.length > 1 ? rows.join('\n') : '', mensagens: n, empresaNome: storeName, segmentId })
}
