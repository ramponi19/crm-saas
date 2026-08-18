import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'

/**
 * Funis são configuração da LOJA, não ferramenta de atendimento.
 *
 * Esta rota não checava papel nenhum — só a RLS, que libera a tabela inteira para
 * qualquer usuário do tenant. Um vendedor podia criar funil, renomear, excluir e,
 * pior, marcar outro como `padrao`: todo lead novo da loja passaria a cair no
 * funil dele. A tela de funil já é de admin, e /api/funil (as etapas) já exigia
 * owner/admin — aqui a tranca faltava.
 */
const ADMIN = ['owner', 'admin'] as const

// Criar funil (duplicando as etapas de um funil de origem — por padrão o funil padrão).
export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi([...ADMIN])
  if (auth.error) return auth.error
  const { supabase, empresaId } = auth
  const body = await req.json().catch(() => ({})) as { nome?: string; origemFunilId?: number }
  const nome = (body.nome ?? '').trim()
  if (!nome) return NextResponse.json({ error: 'Informe o nome do funil' }, { status: 400 })

  const { data: novo, error } = await supabase
    .from('funis')
    .insert({ empresa_id: empresaId, nome, padrao: false })
    .select('id')
    .single()
  if (error || !novo) return NextResponse.json({ error: error?.message ?? 'Falha ao criar' }, { status: 500 })

  // Origem das etapas: funil informado ou o padrão da empresa.
  let origemId = body.origemFunilId
  if (!origemId) {
    const { data: padrao } = await supabase.from('funis').select('id').eq('empresa_id', empresaId).eq('padrao', true).maybeSingle()
    origemId = padrao?.id
  }
  if (origemId) {
    const { data: etapas } = await supabase
      .from('funil_etapas').select('slug, label, cor, tipo, ordem, ativo').eq('funil_id', origemId)
    if (etapas && etapas.length) {
      await supabase.from('funil_etapas').insert(
        etapas.map(e => ({ empresa_id: empresaId, funil_id: novo.id, slug: e.slug, label: e.label, cor: e.cor, tipo: e.tipo, ordem: e.ordem, ativo: e.ativo })) as never,
      )
    }
  }
  return NextResponse.json({ ok: true, id: novo.id })
}

// Renomear ou definir como padrão.
export async function PATCH(req: Request) {
  const auth = await requireEmpresaRoleApi([...ADMIN])
  if (auth.error) return auth.error
  const { supabase, empresaId } = auth
  const body = await req.json().catch(() => ({})) as { id?: number; nome?: string; padrao?: boolean }
  if (!body.id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  if (typeof body.nome === 'string') {
    const nome = body.nome.trim()
    if (!nome) return NextResponse.json({ error: 'Nome vazio' }, { status: 400 })
    const { error } = await supabase.from('funis').update({ nome }).eq('id', body.id).eq('empresa_id', empresaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (body.padrao === true) {
    // Só um padrão por empresa.
    await supabase.from('funis').update({ padrao: false }).eq('empresa_id', empresaId)
    const { error } = await supabase.from('funis').update({ padrao: true }).eq('id', body.id).eq('empresa_id', empresaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// Excluir funil (com guardas: não é o padrão e não tem leads).
export async function DELETE(req: Request) {
  const auth = await requireEmpresaRoleApi([...ADMIN])
  if (auth.error) return auth.error
  const { supabase, empresaId } = auth
  const body = await req.json().catch(() => ({})) as { id?: number }
  if (!body.id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const { data: funil } = await supabase.from('funis').select('padrao').eq('id', body.id).eq('empresa_id', empresaId).maybeSingle()
  if (!funil) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
  if (funil.padrao) return NextResponse.json({ error: 'Não é possível excluir o funil padrão.' }, { status: 400 })

  const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('funil_id', body.id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `Este funil tem ${count} lead(s). Mova-os antes de excluir.` }, { status: 409 })
  }

  const { error } = await supabase.from('funis').delete().eq('id', body.id).eq('empresa_id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
