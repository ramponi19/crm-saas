import { NADA_GRAVADO, nadaGravado } from '@/lib/linhas-afetadas'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { dataDaAcao, proximoPasso, type PassoMin } from '@/lib/cadencia'
import { NextResponse } from 'next/server'
import { marcarNoLead } from '@/lib/leads'
import type { SupabaseClient } from '@supabase/supabase-js'

interface AcaoBody {
  inscricaoId?: number
  tipo?: 'executar' | 'adiar' | 'sair'
  resultado?: string
  observacao?: string
  canal?: string
}

// Mapeia o resultado da fila para o vocabulário do histórico de chamadas.
const RESULTADO_CHAMADA: Record<string, string> = {
  atendeu: 'atendida',
  sem_resposta: 'nao_atendida',
  caixa_postal: 'caixa_postal',
  converteu: 'atendida',
}

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as AcaoBody
  if (!body.inscricaoId) return NextResponse.json({ error: 'Inscrição ausente' }, { status: 400 })

  const { data: insc } = await supabase.from('cadencia_inscricoes')
    .select('id, cadencia_id, lead_id, passo_ordem, created_at, status')
    .eq('id', body.inscricaoId).maybeSingle()
  if (!insc) return NextResponse.json({ error: 'Inscrição não encontrada' }, { status: 404 })
  if (insc.status !== 'ativa') return NextResponse.json({ error: 'Inscrição não está ativa' }, { status: 409 })

  const nowIso = new Date().toISOString()

  // --- Adiar (snooze para amanhã) ---
  if (body.tipo === 'adiar') {
    // Amanhã no mesmo horário: +24h (janela móvel, não depende de fuso).
    const amanha = new Date(Date.now() + 86_400_000)
    const { data: gravadas, error } = await supabase.from('cadencia_inscricoes').update({ proxima_acao_em: amanha.toISOString() }).eq('id', insc.id).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (nadaGravado(gravadas)) return NextResponse.json({ error: NADA_GRAVADO }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  // --- Sair da cadência ---
  if (body.tipo === 'sair') {
    const { data: gravadas, error } = await supabase.from('cadencia_inscricoes').update({ status: 'saiu', proxima_acao_em: null }).eq('id', insc.id).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (nadaGravado(gravadas)) return NextResponse.json({ error: NADA_GRAVADO }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  // --- Executar o passo atual → registra e avança ---
  const canal = body.canal || null
  await supabase.from('cadencia_execucoes').insert({
    empresa_id: empresaId,
    inscricao_id: insc.id,
    passo_ordem: insc.passo_ordem,
    canal,
    resultado: body.resultado || 'feito',
    observacao: body.observacao?.trim() || null,
    executado_por: user.id,
  })

  // Ligação também entra no histórico de chamadas do lead.
  if (canal === 'ligacao') {
    await supabase.from('chamadas').insert({
      empresa_id: empresaId, lead_id: insc.lead_id, usuario_id: user.id,
      direcao: 'saida', resultado: RESULTADO_CHAMADA[body.resultado || ''] || 'nao_atendida',
      observacao: body.observacao?.trim() || null,
    })
  }

  // Foi um contato → atualiza a última tratativa (reflete no timer do card).
  // Mora em negocios.dados._lead (a view `leads` caiu). Como antes, falhar aqui
  // não desfaz a execução já registrada.
  if (insc.lead_id) {
    await marcarNoLead(supabase as unknown as SupabaseClient, insc.lead_id, { ultima_tratativa: nowIso })
      .catch((e) => console.error('[cadencias/acao] ultima_tratativa:', e))
  }

  // "converteu" encerra a cadência; senão, avança para o próximo passo.
  let concluir = body.resultado === 'converteu'
  let proxOrdem = insc.passo_ordem
  let proxData: string | null = null

  if (!concluir) {
    const { data: passos } = await supabase.from('cadencia_passos')
      .select('ordem, dia_offset').eq('cadencia_id', insc.cadencia_id).order('ordem', { ascending: true })
    const prox = proximoPasso((passos ?? []) as PassoMin[], insc.passo_ordem)
    if (prox) {
      proxOrdem = prox.ordem
      proxData = dataDaAcao(insc.created_at || nowIso, prox.dia_offset)
    } else {
      concluir = true // era o último passo
    }
  }

  const patch = concluir
    ? { status: 'concluida', concluida_em: nowIso, proxima_acao_em: null }
    : { passo_ordem: proxOrdem, proxima_acao_em: proxData }
  const { data: gravadas, error } = await supabase.from('cadencia_inscricoes').update(patch).eq('id', insc.id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (nadaGravado(gravadas)) return NextResponse.json({ error: NADA_GRAVADO }, { status: 404 })

  return NextResponse.json({ ok: true, concluida: concluir })
}
