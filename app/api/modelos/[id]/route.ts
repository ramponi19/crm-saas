import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { apagarEmTodosOsNumeros } from '@/lib/canais/modelos-waba'

/**
 * Apaga o modelo. Tenta apagar na Meta primeiro, em CADA número de WhatsApp da empresa (o
 * modelo existe em cada WABA); se lá já não existe (ou o WhatsApp foi desconectado), remove só
 * o espelho — deixar linha órfã na tela seria pior, porque o usuário veria um modelo que não
 * existe mais.
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

    const avisos = await apagarEmTodosOsNumeros(svc, empresaId, modelo.id, modelo.nome)
    const avisoMeta = avisos.length ? `Removido do CRM, mas a Meta respondeu: ${avisos.join(' · ')}` : null

    const { error } = await svc.from('modelos_mensagem')
      .delete().eq('id', Number(id)).eq('empresa_id', empresaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, aviso: avisoMeta })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
