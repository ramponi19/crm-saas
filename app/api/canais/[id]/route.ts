import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Desconecta o canal no CRM: apaga a linha, e com ela o token cifrado.
 *
 * O que isto NÃO faz, e o cliente precisa saber: não desfaz a coexistência do
 * lado da Meta. Desconectar de verdade é decisão do dono, pelo app dele
 * (Configurações → Conta → Plataforma Business) — a API não tem esse poder.
 * Aqui o efeito é o CRM parar de receber e de enviar por este canal.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOwnerOrAdminApi()
    if (auth.error) return auth.error
    const { empresaId } = auth
    const { id } = await ctx.params

    const svc = createServiceClient()
    // Filtro por empresa_id junto do id: impede apagar canal de outra empresa
    // mesmo que alguém invente um id na URL.
    const { data, error } = await svc
      .from('canais_conectados')
      .delete()
      .eq('id', Number(id))
      .eq('empresa_id', empresaId)
      .select('id, tipo')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'Canal não encontrado.' }, { status: 404 })

    return NextResponse.json({ success: true, tipo: data[0].tipo })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
