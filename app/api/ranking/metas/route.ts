import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * `imoveis_captados` entra aqui porque `valorMetrica` já sabe medir e a tela já
 * oferece a opção onde o segmento capta ativo. Fora da lista, o tipo caía no
 * silêncio pior possível: a rota trocava por "vendas" e a meta passava a medir
 * outra coisa sem avisar ninguém.
 */
const TIPOS = ['vendas', 'fechamentos', 'visitas', 'propostas', 'captacoes', 'imoveis_captados', 'faturamento']

async function exigirAdmin(supabase: Awaited<ReturnType<typeof createClient>>, empresaId: number, userId: string) {
  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', userId).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', userId).single(),
  ])
  return usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
}

// Cria uma meta gamificada (pessoa/equipe, por tipo, período). Admin.
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await exigirAdmin(supabase, empresaId, user.id))) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as { escopo?: string; usuario_id?: string | null; tipo?: string; alvo?: number; periodo?: string }
  if (!b.periodo || !/^\d{4}-\d{2}$/.test(b.periodo)) return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  const escopo = b.escopo === 'equipe' ? 'equipe' : 'pessoa'
  const tipo = TIPOS.includes(b.tipo || '') ? b.tipo! : 'vendas'
  if (escopo === 'pessoa' && !b.usuario_id) return NextResponse.json({ error: 'Escolha a pessoa' }, { status: 400 })

  const { error } = await supabase.from('metas').insert({
    empresa_id: empresaId, escopo, usuario_id: escopo === 'equipe' ? null : b.usuario_id, tipo,
    alvo: Math.max(0, Number(b.alvo) || 0), periodo: b.periodo,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await exigirAdmin(supabase, empresaId, user.id))) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'ID ausente' }, { status: 400 })
  const { error } = await supabase.from('metas').delete().eq('id', id).eq('empresa_id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
