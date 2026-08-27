import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRoleApi } from '@/lib/owner'

/**
 * Troca a loja em que o dono está trabalhando.
 *
 * A escolha vai para `usuarios.filial_atual_id` porque a RLS precisa lê-la DENTRO
 * do banco — mesmo motivo pelo qual `get_empresa_id()` lê
 * `usuarios.impersonando_empresa_id` do super admin. Guardar isso num cookie ou no
 * estado da tela deixaria a separação de lojas dependente do que o navegador manda,
 * que é justamente o que não pode acontecer.
 *
 * `filialId: null` significa "Rede (todas as lojas)".
 *
 * SÓ DONO E ADMIN. Para o vendedor a função `filiais_visiveis()` ignora esta
 * seleção e devolve a loja dele — então mesmo que ele grave o campo por outro
 * caminho, não vê nada além da própria loja. A checagem aqui é a primeira porta,
 * não a única.
 */
export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { userId, empresaId } = auth

  const { filialId } = (await req.json().catch(() => ({}))) as { filialId?: number | null }
  const svc = createServiceClient()

  if (filialId != null) {
    const { data: filial } = await svc.from('filiais')
      .select('id').eq('id', filialId).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle()
    if (!filial) {
      return NextResponse.json({ error: 'Loja não encontrada nesta empresa' }, { status: 404 })
    }
  }

  const { error } = await svc.from('usuarios')
    .update({ filial_atual_id: filialId ?? null } as never).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, filialId: filialId ?? null })
}
