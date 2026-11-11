import type { SupabaseClient } from '@supabase/supabase-js'
import { ehErro, saudeDaWaba } from '@/lib/canais/meta'
import { numerosWhatsApp } from '@/lib/canais/modelos-waba'

/**
 * CONTA DA META SEM FORMA DE PAGAMENTO, POR LOJA (11/11/2026).
 *
 * Modelo (Transmissão, Automatize) abre conversa paga. Sem forma de pagamento na conta da
 * Meta, a Meta ACEITA o envio e depois devolve "falhou" (131042) — no smoke de 11/11 foi o
 * que aconteceu nas duas WABAs da JM. Mensagem de sessão (responder cliente) segue saindo, então
 * a loja não percebe sozinha: o aviso tem de aparecer onde se manda modelo.
 *
 * Duas fontes, por número (WABA):
 *  - `health_status` da Graph (saudeDaWaba), guardado 10 min em `configuracoes_sistema`
 *    (chave `whatsapp_saude`) para não chamar a Meta a cada tela;
 *  - recusa por pagamento numa mensagem do número DEPOIS da última leitura boa da Graph
 *    (o cache ainda não viu, ou a Graph não respondeu).
 * Tudo com o cliente de serviço (o token do canal não sai do servidor).
 */
type Db = SupabaseClient
const CHAVE = 'whatsapp_saude'
const VALIDADE_MS = 10 * 60_000

type Registro = { pagamento_ok: boolean; checado_em: string; erro?: string | null }
export type AvisoPagamento = { filial_id: number | null; loja: string; texto: string }

export const textoSemPagamento = (loja: string) => `Conta da Meta de ${loja} sem forma de pagamento`

export async function avisosDePagamento(svc: Db, empresaId: number, agora = new Date()): Promise<AvisoPagamento[]> {
  const numeros = await numerosWhatsApp(svc, empresaId)
  if (!numeros.length) return []

  const { data: cfg } = await svc.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', CHAVE).maybeSingle()
  const guardado = (cfg as { valor?: unknown } | null)?.valor
  const cache: Record<string, Registro> = guardado && typeof guardado === 'object' ? { ...(guardado as Record<string, Registro>) } : {}
  let mudou = false
  await Promise.all(numeros.map(async (n) => {
    const r = cache[n.wabaId]
    if (r && !r.erro && agora.getTime() - new Date(r.checado_em).getTime() < VALIDADE_MS) return
    let s: Awaited<ReturnType<typeof saudeDaWaba>>
    try { s = await saudeDaWaba(n.wabaId, n.token) } catch (e) { s = { erro: e instanceof Error ? e.message : String(e) } }
    // Graph fora: mantém a última leitura boa (e a hora dela) e anota o erro.
    if (ehErro(s)) {
      cache[n.wabaId] = { pagamento_ok: r?.pagamento_ok ?? true, checado_em: r?.checado_em ?? new Date(0).toISOString(), erro: s.erro.slice(0, 200) }
    } else {
      cache[n.wabaId] = { pagamento_ok: s.pagamentoOk, checado_em: agora.toISOString(), erro: null }
    }
    mudou = true
  }))
  if (mudou) {
    await svc.from('configuracoes_sistema')
      .upsert({ empresa_id: empresaId, chave: CHAVE, valor: cache, updated_at: agora.toISOString() } as never, { onConflict: 'empresa_id,chave' })
  }

  // Recusa por pagamento nas últimas 48 h (índice empresa_id, created_at), por canal.
  const { data: recusas } = await svc.from('mensagens').select('canal_id, status_em')
    .eq('empresa_id', empresaId).eq('direcao', 'enviada').eq('status_entrega', 'falhou')
    .ilike('erro_envio', '%forma de pagamento%')
    .gte('created_at', new Date(agora.getTime() - 48 * 3_600_000).toISOString())
    .order('created_at', { ascending: false }).limit(100)
  const ultimaRecusa = new Map<number, number>()
  for (const m of (recusas ?? []) as { canal_id: number | null; status_em: string | null }[]) {
    if (m.canal_id == null || !m.status_em) continue
    ultimaRecusa.set(Number(m.canal_id), Math.max(ultimaRecusa.get(Number(m.canal_id)) ?? 0, new Date(m.status_em).getTime()))
  }

  const bloqueadas = numeros.filter((n) => {
    const r = cache[n.wabaId]
    if (r && !r.pagamento_ok) return true
    const desde = r ? new Date(r.checado_em).getTime() : 0
    return n.canais.some((c) => (ultimaRecusa.get(c) ?? 0) > desde)
  })
  if (!bloqueadas.length) return []

  const ids = [...new Set(bloqueadas.flatMap((n) => n.filiais).filter((f): f is number => f != null))]
  const { data: fs } = ids.length ? await svc.from('filiais').select('id, nome').in('id', ids) : { data: [] }
  const nome = new Map(((fs ?? []) as { id: number; nome: string }[]).map((f) => [Number(f.id), f.nome]))
  const avisos: AvisoPagamento[] = []
  for (const n of bloqueadas) {
    for (const f of new Set(n.filiais)) {
      const loja = f == null ? 'toda a empresa' : (nome.get(Number(f)) ?? `loja ${f}`)
      avisos.push({ filial_id: f, loja, texto: textoSemPagamento(loja) })
    }
  }
  return avisos.sort((a, b) => a.loja.localeCompare(b.loja, 'pt-BR'))
}
