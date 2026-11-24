import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'

/**
 * "NÃO QUERO RECEBER OFERTAS" NO CARD DO CLIENTE (core, 24/11/2026; migração 20261124001900).
 * GET  ?contato=<id>               o selo: desde quando e por quê (RLS do contato)
 * POST { contato_id, ligar }       a equipe marca a pedido do cliente; desfazer, só dono ou administrador (a RPC decide)
 * Vale para todos os contatos da empresa com o mesmo telefone; só barra modelo de Marketing.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const empresaId = await getEmpresaId()
  const id = Number(new URL(req.url).searchParams.get('contato'))
  if (!empresaId || !Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Contato inválido' }, { status: 400 })
  const { data } = await supabase.from('contatos').select('sem_ofertas_em, sem_ofertas_origem' as never).eq('id', id).eq('empresa_id', empresaId).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { contato_id?: unknown; ligar?: unknown }
  const id = Number(b.contato_id)
  if (!Number.isInteger(id) || id <= 0 || typeof b.ligar !== 'boolean') return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  const { data, error } = await supabase.rpc('contato_sem_ofertas' as never, { p_contato: id, p_ligar: b.ligar } as never)
  if (error) {
    const m = error.message
    const [status, msg] = m.startsWith('SEM_PERMISSAO') ? [403, 'Só o dono ou um administrador volta a enviar ofertas.']
      : m.startsWith('NAO_ENCONTRADO') ? [404, 'Contato não encontrado.'] : m.startsWith('SOMENTE_LEITURA') ? [403, 'A empresa está em modo somente leitura.']
      : [500, 'Não foi possível salvar.']
    return NextResponse.json({ error: msg }, { status })
  }
  return NextResponse.json({ ok: true, resultado: data })
}
