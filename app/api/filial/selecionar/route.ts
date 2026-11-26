import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { contextoDaSessao, exigirLojaDeAtuacao, lojasDeAtuacao, temPermissao } from '@/lib/sessao'
import { filialEscolhida } from '@/lib/filial-escolha'

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
 * QUEM ESCOLHE: quem vê a rede (permissão lojas.ver_rede: Dono, Administrador e Consulta, de fábrica; etapa 1.1b)
 * ou quem enxerga 2+ lojas (5a, 26/11/2026: lista "lojas que enxerga"); `null` aí é "Todas as minhas lojas", só
 * para ver (gravar é sempre numa loja específica: a do topo ou a principal). Só aceita loja em que a pessoa pode
 * atuar; o banco confere de novo (gatilho usuarios_loja_topo_confere, 0910) e `filiais_visiveis()` ignora o resto.
 */
export async function POST(req: Request) {
  const ctx = await contextoDaSessao()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!ctx.empresa_id) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!ctx.superadmin && !temPermissao(ctx, 'lojas.ver_rede') && (await lojasDeAtuacao()).length < 2) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const userId = ctx.usuario_id
  const empresaId = ctx.empresa_id

  // Corpo mal formado é 400, não 500 (lib/filial-escolha.ts).
  const filialId = filialEscolhida(await req.json().catch(() => undefined))
  if (filialId === undefined) {
    return NextResponse.json({ error: 'Envie { filialId: número da loja ou null }' }, { status: 400 })
  }
  const svc = createServiceClient()

  if (filialId != null) {
    // só loja em que a pessoa pode atuar (o banco também confere: gatilho usuarios_loja_topo_confere, 0910)
    const semAtuacao = await exigirLojaDeAtuacao(filialId)
    if (semAtuacao) return semAtuacao
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
