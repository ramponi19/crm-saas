import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * CORRIGIR A DATA DE UMA VENDA FECHADA (23/11/2026, M3 do pós-venda).
 *
 * Só pela RPC `corrigir_data_venda`, com a sessão do usuário: ela confere dono/admin, empresa,
 * motivo e a data (nunca no futuro, nunca antes de 2024), muda SÓ `ganho_em` e grava
 * `data_venda_corrigida` no histórico. Esta rota traduz a recusa em código e status que a
 * tela entende; não tem regra própria.
 */
const CODIGOS: Record<string, number> = {
  NEGOCIO_NAO_ENCONTRADO: 404,
  SEM_PERMISSAO: 403,
  SOMENTE_LEITURA: 423,
  NAO_E_GANHO: 409,
  MOTIVO_OBRIGATORIO: 400,
  DATA_INVALIDA: 400,
  DATA_FUTURA: 400,
  DATA_ANTIGA: 400,
  DATA_IGUAL: 400,
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null) as { leadId?: unknown; data?: unknown; motivo?: unknown } | null
  const leadId = Number(body?.leadId)
  const data = typeof body?.data === 'string' ? body.data.trim() : ''
  const motivo = typeof body?.motivo === 'string' ? body.motivo : ''
  if (!Number.isSafeInteger(leadId) || leadId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'Dados incompletos', codigo: 'DATA_INVALIDA' }, { status: 400 })
  }

  const { data: r, error } = await supabase.rpc('corrigir_data_venda', { p_negocio: leadId, p_nova_data: data, p_motivo: motivo })
  if (error) {
    const codigo = Object.keys(CODIGOS).find((c) => error.message.startsWith(c)) ?? 'FALHOU'
    const texto = error.message.includes(':') ? error.message.slice(error.message.indexOf(':') + 1).trim() : error.message
    return NextResponse.json({ error: codigo === 'NEGOCIO_NAO_ENCONTRADO' ? 'Negócio não encontrado' : texto, codigo }, { status: CODIGOS[codigo] ?? 500 })
  }
  const res = (r ?? {}) as { ganho_em_novo?: string; avisos?: string[] }
  return NextResponse.json({ ok: true, ganho_em: res.ganho_em_novo ?? null, avisos: res.avisos ?? [] })
}
