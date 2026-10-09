import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { analisarLeads, gravarAnalise } from '@/lib/zapintel/analise'

/**
 * RECALCULA A ANÁLISE DO ZAPINTEL.
 *
 * Dois usos, o mesmo caminho de cálculo:
 *
 *  · `{ leads: [123, 456] }` — incremental. É o que roda quando chega mensagem:
 *    ~120 ms por lead, porque só aquela conversa mudou.
 *  · `{ desde: 0 }` — carga completa, em lotes. Devolve `proximo` para a tela
 *    continuar de onde parou.
 *
 * ══ POR QUE EM LOTES ═══════════════════════════════════════════════════════
 *
 * Medido em 09/10/2026: analisar os 2.039 leads de uma vez leva 13,4 s, acima
 * dos 10 s de limite da função. E o tempo é quase todo TRANSPORTE — o motor lê
 * as 50.863 mensagens em 507 ms; são as 51 páginas da API que custam 12,7 s.
 * Em lotes de 300 leads cada chamada fica em poucos segundos, com folga.
 */
export const dynamic = 'force-dynamic'

/** Leads por lote na carga completa. Ver o cabeçalho para o porquê. */
const LOTE = 300

/** Teto do incremental: acima disso é carga completa, não "chegou mensagem". */
const MAX_INCREMENTAL = 50

export async function POST(req: Request) {
  const { empresaId } = await zapintelEmpresa()
  const db = rastrDb()
  const inicio = Date.now()

  const body = (await req.json().catch(() => ({}))) as { leads?: number[]; desde?: number }

  // ── Incremental: só os leads pedidos ──────────────────────────────────────
  if (Array.isArray(body.leads) && body.leads.length) {
    const ids = body.leads.filter((n) => Number.isInteger(n)).slice(0, MAX_INCREMENTAL)
    const linhas = await analisarLeads(db, empresaId, ids)
    const gravadas = await gravarAnalise(db, linhas)
    return NextResponse.json({ modo: 'incremental', leads: gravadas, ms: Date.now() - inicio })
  }

  // ── Carga completa, um lote por chamada ───────────────────────────────────
  const desde = Number.isInteger(body.desde) ? (body.desde as number) : 0

  const { data: pagina } = await db
    .from('leads')
    .select('id')
    .eq('empresa_id', empresaId).eq('ativo', true)
    .gt('id', desde)
    .order('id', { ascending: true })
    .limit(LOTE)

  const ids = (pagina ?? []).map((l) => l.id as number)
  if (!ids.length) {
    return NextResponse.json({ modo: 'completo', leads: 0, fim: true, ms: Date.now() - inicio })
  }

  const linhas = await analisarLeads(db, empresaId, ids)
  const gravadas = await gravarAnalise(db, linhas)

  return NextResponse.json({
    modo: 'completo',
    leads: gravadas,
    // Cursor por id (não offset): lead criado durante a carga não faz o lote
    // seguinte pular registros, que é como offset perde dado em tabela viva.
    proximo: ids[ids.length - 1],
    fim: ids.length < LOTE,
    ms: Date.now() - inicio,
  })
}
