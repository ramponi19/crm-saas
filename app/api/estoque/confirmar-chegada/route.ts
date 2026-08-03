import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'

/**
 * Confirma que o aparelho aceito em troca chegou fisicamente na loja.
 *
 * Enquanto não chega, a unidade fica `pendente`: fora do PDV (que só lista
 * `disponivel`) e segurando a comissão do fechamento que a trouxe. Confirmar é o
 * ato que libera as duas coisas — por isso é uma ação explícita de alguém que viu
 * o aparelho, e não algo que o sistema deduz sozinho.
 */
export async function POST(req: NextRequest) {
  let body: { id?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 }) }
  const id = Number(body.id)
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Unidade inválida' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  // Só sai de `pendente`: o filtro no UPDATE faz a confirmação ser idempotente.
  // Dois cliques (ou dois atendentes) não sobrescrevem quem confirmou primeiro,
  // e não reabrem uma unidade que já foi vendida ou reservada depois.
  const { data: confirmada, error } = await supabase
    .from('inventario_unidades')
    .update({
      status: 'disponivel',
      recebido_em: new Date().toISOString(),
      recebido_por: user.id,
    })
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .eq('status', 'pendente')
    .select('id, imei, observacoes')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!confirmada) {
    return NextResponse.json(
      { error: 'Esta unidade não está pendente — a chegada já foi confirmada por outra pessoa.' },
      { status: 409 },
    )
  }

  return NextResponse.json({ ok: true, id: confirmada.id })
}
