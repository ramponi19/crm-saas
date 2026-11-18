import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logSuperAdminAction, requireSuperAdminApi } from '@/lib/superadmin'
import { MODULOS } from '@/core/modulos'
import { EXTRAS } from '@/lib/precos-adicionais'

/**
 * Tabela de preços de módulos e extras (precos_adicionais, 18/11/2026 — plano único + módulos).
 * Só o superadmin grava; a chave tem de ser um extra conhecido ou um módulo do manifesto.
 * Preço nulo = "a definir".
 */
export async function PUT(req: Request) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const body = (await req.json().catch(() => ({}))) as { chave?: unknown; preco_centavos?: unknown; ativo?: unknown }
  const chave = typeof body.chave === 'string' ? body.chave : ''
  const extra = EXTRAS.find((e) => e.chave === chave)
  const modulo = MODULOS.find((m) => m.chave === chave)
  if (!extra && !modulo) return NextResponse.json({ error: 'Item desconhecido' }, { status: 400 })

  const preco = body.preco_centavos
  if (preco !== null && (typeof preco !== 'number' || !Number.isInteger(preco) || preco < 0)) {
    return NextResponse.json({ error: 'Preço inválido: inteiro em centavos, ou vazio para "a definir"' }, { status: 400 })
  }
  if (body.ativo !== undefined && typeof body.ativo !== 'boolean') {
    return NextResponse.json({ error: 'ativo deve ser boolean' }, { status: 400 })
  }

  const linha = {
    chave,
    tipo: extra ? 'extra' : 'modulo',
    nome: extra?.nome ?? modulo!.nome,
    unidade: extra?.unidade ?? 'por mês',
    preco_centavos: preco as number | null,
    ...(typeof body.ativo === 'boolean' ? { ativo: body.ativo } : {}),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await createServiceClient().from('precos_adicionais')
    .upsert(linha, { onConflict: 'chave' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({ adminUserId: auth.userId, acao: 'editar_preco_adicional', detalhes: { chave, preco_centavos: preco } })
  return NextResponse.json({ preco: data })
}
