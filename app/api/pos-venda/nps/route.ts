import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { posvendaLigado } from '@/lib/posvenda/ligado'

/**
 * NPS MANUAL PELO CARD DO CLIENTE (C7 bloco 4, 24/11/2026): a nota que o cliente deu fora da fila (no balcão, por
 * ligação). POST { negocio_id, nota (0–10), comentario? }. A RPC (1700) confere o responsável ou dono/admin, grava ou
 * atualiza a nota da venda e, até o limite da empresa, abre o chamado para os administradores.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Sem empresa' }, { status: 400 })
  if (!(await posvendaLigado(createServiceClient(), empresaId))) {
    return NextResponse.json({ error: 'O Pós-venda não está ligado nesta empresa.', code: 'modulo_desligado', modulo: 'posvenda' }, { status: 403 })
  }
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const negocio = Number(b.negocio_id), nota = Number(b.nota)
  if (!Number.isInteger(negocio) || negocio <= 0) return NextResponse.json({ error: 'Venda inválida' }, { status: 400 })
  if (!Number.isInteger(nota) || nota < 0 || nota > 10) return NextResponse.json({ error: 'A nota vai de 0 a 10.' }, { status: 422 })
  const comentario = typeof b.comentario === 'string' && b.comentario.trim() ? b.comentario.trim().slice(0, 2000) : null
  const { data, error } = await supabase.rpc('posvenda_nps_registrar' as never,
    { p_negocio: negocio, p_nota: nota, p_comentario: comentario, p_acompanhamento: null, p_canal: 'manual' } as never)
  if (error) {
    const m = error.message
    const [status, msg] = m.startsWith('SEM_PERMISSAO') ? [403, 'Só o responsável pelo cliente, o dono ou um administrador registra a nota.']
      : m.startsWith('NAO_ENCONTRADO') ? [404, 'Venda não encontrada.'] : m.startsWith('SEM_CONTATO') ? [422, 'A venda não tem cliente.']
      : m.startsWith('MODULO_DESLIGADO') ? [403, 'O Pós-venda não está ligado nesta empresa.'] : [500, 'Não foi possível registrar a nota.']
    return NextResponse.json({ error: msg }, { status })
  }
  return NextResponse.json({ ok: true, resultado: data })
}
