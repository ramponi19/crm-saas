import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { posvendaLigado } from '@/lib/posvenda/ligado'
import { numeroPositivo } from '@/lib/posvenda/config'

/**
 * USO INFORMADO (24/11/2026, migração 2200): o cliente ou o atendente conta o uso atual (ex.: horas de uso). POST
 * { negocio_id, campo, valor, em? (YYYY-MM-DD, padrão hoje) }. A RPC confere quem cuida do cliente ou dono/admin,
 * grava a leitura e recalcula os passos de uso pendentes da venda pelo ritmo real.
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
  const negocio = Number(b.negocio_id)
  const campo = typeof b.campo === 'string' ? b.campo : ''
  const valor = b.valor === 0 || b.valor === '0' ? 0 : numeroPositivo(b.valor)
  const em = typeof b.em === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.em) ? b.em : null
  if (!Number.isInteger(negocio) || negocio <= 0) return NextResponse.json({ error: 'Venda inválida' }, { status: 400 })
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(campo)) return NextResponse.json({ error: 'Campo inválido' }, { status: 400 })
  if (valor == null) return NextResponse.json({ error: 'Informe um número.' }, { status: 422 })
  const { data, error } = await supabase.rpc('posvenda_uso_registrar' as never,
    { p_negocio: negocio, p_campo: campo, p_valor: valor, p_em: em } as never)
  if (error) {
    const m = error.message
    const [status, msg] = m.startsWith('SEM_PERMISSAO') ? [403, 'Só quem cuida do cliente, o dono ou um administrador informa o uso.']
      : m.startsWith('NAO_ENCONTRADO') ? [404, 'Venda não encontrada.'] : m.startsWith('VALOR_INVALIDO') ? [422, 'Valor inválido.']
      : [500, 'Não foi possível registrar o uso.']
    return NextResponse.json({ error: msg }, { status })
  }
  return NextResponse.json({ ok: true, resultado: data })
}
