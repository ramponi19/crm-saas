import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { executarRecebeuEtiqueta } from '@/lib/automacoes'

/**
 * APLICAR / TIRAR ETIQUETA (core, 11/11/2026) — o card do lead (1 negócio) e o lote do quadro
 * (os cartões selecionados).
 *
 * POST {negocios: number[], etiqueta_id, aplicar: boolean}
 *   → etiquetas_aplicar com o cliente do USUÁRIO: a RLS de negocios/contatos decide o que ele
 *     alcança (o vendedor, a loja dele); o histórico sai do gatilho no banco.
 *   ← {negocios: ids cujo contato mudou, contatos, alcancados, pedidos}
 * Aplicou: o gatilho "recebeu etiqueta" do Automatize roda para os negócios que mudaram (fila
 * e travas de sempre). Erro no Automatize não desfaz a etiqueta: fica no log.
 */
export async function POST(req: Request) {
  const [db, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await db.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const negocios = Array.isArray(b.negocios)
    ? [...new Set((b.negocios as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : []
  const etiquetaId = Number(b.etiqueta_id)
  const aplicar = b.aplicar !== false
  if (!negocios.length) return NextResponse.json({ error: 'Escolha pelo menos um lead.' }, { status: 400 })
  if (negocios.length > 500) return NextResponse.json({ error: 'No máximo 500 leads por vez.' }, { status: 400 })
  if (!Number.isInteger(etiquetaId) || etiquetaId <= 0) return NextResponse.json({ error: 'Escolha a etiqueta.' }, { status: 400 })

  const { data, error } = await db.rpc('etiquetas_aplicar' as never, { p_negocios: negocios, p_etiqueta: etiquetaId, p_aplicar: aplicar } as never)
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : 400
    return NextResponse.json({ error: error.code === 'P0002' ? 'Etiqueta não encontrada.' : error.message }, { status })
  }
  const r = (data ?? {}) as { negocios?: number[]; contatos?: number[]; alcancados?: number }
  const mudaram = r.negocios ?? []

  if (aplicar && mudaram.length) {
    try {
      await executarRecebeuEtiqueta(createServiceClient(), empresaId, mudaram, etiquetaId)
    } catch (e) {
      console.error('executarRecebeuEtiqueta:', e)
    }
  }
  return NextResponse.json({
    ok: true, negocios: mudaram, contatos: r.contatos ?? [], alcancados: r.alcancados ?? 0, pedidos: negocios.length,
  })
}
