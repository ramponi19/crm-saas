import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'

/**
 * Almoço / ausência do atendente.
 *
 * Ligar NÃO é só um aviso: solta na hora todos os leads dele, para que os
 * colegas atendam enquanto ele está fora. Um lead parado esperando alguém que
 * saiu para almoçar é cliente esperando sem saber.
 *
 * Desligar apenas volta a receber distribuição — nada é puxado de volta (regra
 * escolhida pelo dono). Quem pegou, atende; e o que sobrou na esteira segue lá
 * para quem chegar primeiro.
 */
export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { ausente } = (await req.json().catch(() => ({}))) as { ausente?: boolean }
  if (typeof ausente !== 'boolean') {
    return NextResponse.json({ error: 'Informe ausente: true|false' }, { status: 400 })
  }

  const { error } = await supabase
    .from('empresa_usuarios')
    .update({ ausente, ausente_em: ausente ? new Date().toISOString() : null })
    .eq('empresa_id', empresaId).eq('usuario_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let liberados = 0
  if (ausente) {
    // Etapas finais ficam onde estão: lead ganho ou perdido não precisa de
    // ninguém agora, e soltá-lo só encheria a esteira de trabalho que não existe.
    const { data: finais } = await supabase.from('funil_etapas')
      .select('slug').eq('empresa_id', empresaId).in('tipo', ['ganho', 'perdido'])
    const slugs = (finais ?? []).map((e: { slug: string }) => e.slug)

    const base = supabase.from('leads')
      .update({ responsavel_id: null, responsavel_desde: null })
      .eq('empresa_id', empresaId).eq('responsavel_id', user.id).eq('ativo', true)
    const { data } = slugs.length
      ? await base.not('kanban_status', 'in', `(${slugs.join(',')})`).select('id')
      : await base.select('id')
    liberados = data?.length ?? 0
  }

  return NextResponse.json({ ok: true, ausente, liberados })
}
