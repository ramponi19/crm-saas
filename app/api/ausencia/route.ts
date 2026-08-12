import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { aguardandoResposta } from '@/lib/esteira'

/**
 * Almoço / ausência do atendente.
 *
 * Ligar NÃO é só um aviso: solta na hora os leads em que O CLIENTE ESTÁ
 * ESPERANDO RESPOSTA, para que os colegas atendam enquanto ele está fora. Um
 * cliente parado esperando alguém que saiu para almoçar espera sem saber.
 *
 * O QUE ELE JÁ RESPONDEU CONTINUA DELE. A versão anterior soltava a carteira
 * inteira, e ir almoçar custava leads bem atendidos — punição por fazer pausa,
 * e ainda por cima entregava ao colega conversa que ninguém estava esperando.
 * Se o cliente escrever durante a ausência, quem devolve é a esteira, no mesmo
 * prazo de sempre (30 min de horário útil, configurável).
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

    // Dois passos porque a comparação é ENTRE COLUNAS (recebida > enviada), que o
    // PostgREST não expressa num filtro. Lê os candidatos, decide com a mesma
    // função da esteira e solta só esses.
    const consulta = supabase.from('leads')
      .select('id, ultima_recebida_at, ultima_enviada_at')
      .eq('empresa_id', empresaId).eq('responsavel_id', user.id).eq('ativo', true)
    const { data: meus } = slugs.length
      ? await consulta.not('kanban_status', 'in', `(${slugs.join(',')})`)
      : await consulta

    const pendentes = (meus ?? []).filter(aguardandoResposta).map((l) => l.id)
    if (pendentes.length) {
      // Condicional no responsável: se alguém já assumiu nesse meio-tempo, a
      // linha não é tocada.
      const { data } = await supabase.from('leads')
        .update({ responsavel_id: null, responsavel_desde: null })
        .in('id', pendentes).eq('responsavel_id', user.id).select('id')
      liberados = data?.length ?? 0
    }
  }

  return NextResponse.json({ ok: true, ausente, liberados })
}
