import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { decifrarToken } from '@/lib/canais/crypto'
import { apagarModelo, ehErro } from '@/lib/canais/meta'

/**
 * Apaga o modelo. Tenta apagar na Meta primeiro; se lá já não existe (ou o
 * WhatsApp foi desconectado), remove só o espelho — deixar linha órfã na tela
 * seria pior, porque o usuário veria um modelo que não existe mais.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOwnerOrAdminApi()
    if (auth.error) return auth.error
    const { empresaId } = auth
    const { id } = await ctx.params

    const svc = createServiceClient()
    const { data: modelo } = await svc
      .from('modelos_mensagem')
      .select('id, nome')
      .eq('id', Number(id)).eq('empresa_id', empresaId).maybeSingle()
    if (!modelo) return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 404 })

    const { data: canais } = await svc
      .from('canais_conectados')
      .select('waba_id, access_token_enc')
      .eq('empresa_id', empresaId).eq('tipo', 'whatsapp')
      .order('conectado_em', { ascending: false }).limit(1)

    const canal = canais?.[0]
    let avisoMeta: string | null = null
    if (canal?.waba_id && canal.access_token_enc) {
      try {
        const r = await apagarModelo(String(canal.waba_id), decifrarToken(canal.access_token_enc), modelo.nome)
        if (ehErro(r)) avisoMeta = `Removido do CRM, mas a Meta respondeu: ${r.erro}`
      } catch {
        avisoMeta = 'Removido do CRM, mas não foi possível confirmar a remoção na Meta.'
      }
    }

    const { error } = await svc.from('modelos_mensagem')
      .delete().eq('id', Number(id)).eq('empresa_id', empresaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, aviso: avisoMeta })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
