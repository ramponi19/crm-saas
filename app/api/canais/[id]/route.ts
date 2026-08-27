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

/**
 * Define a QUEM este canal atende: uma loja, ou toda a rede.
 *
 * `filialId: null` = da rede, e e o padrao de tudo que existia antes das filiais.
 * O Instagram da marca deve ficar assim; o WhatsApp de uma loja, nao.
 *
 * A CONSEQUENCIA VAI ALEM DA TELA, e por isso a resposta avisa: o lead que entra
 * por um canal de loja deveria nascer naquela loja, e isso ainda nao acontece —
 * quem cria o lead a partir da mensagem e a funcao de borda, que hoje nao le a
 * loja do canal. Ate isso ser feito, todo lead de canal nasce na loja principal.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOwnerOrAdminApi()
    if (auth.error) return auth.error
    const { empresaId } = auth
    const { id } = await ctx.params

    const { filialId } = (await req.json().catch(() => ({}))) as { filialId?: number | null }
    const svc = createServiceClient()

    if (filialId != null) {
      const { data: filial } = await svc
        .from('filiais')
        .select('id')
        .eq('id', filialId)
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .maybeSingle()
      if (!filial) return NextResponse.json({ error: 'Loja nao encontrada nesta empresa.' }, { status: 400 })
    }

    // empresa_id junto do id, como no DELETE: impede mexer em canal de outra
    // empresa mesmo com um id inventado na URL.
    const { data, error } = await svc
      .from('canais_conectados')
      .update({ filial_id: filialId ?? null, updated_at: new Date().toISOString() })
      .eq('id', Number(id))
      .eq('empresa_id', empresaId)
      .select('id, filial_id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'Canal nao encontrado.' }, { status: 404 })

    return NextResponse.json({ success: true, filialId: data[0].filial_id })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
