import { nadaGravado } from '@/lib/linhas-afetadas'
import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { aguardandoResposta } from '@/lib/esteira'
import { conversasDosLeads } from '@/lib/leads'
import type { SupabaseClient } from '@supabase/supabase-js'

/** `string`: com relação embutida o parser de tipos do supabase-js estoura. */
const SELECT_MEUS: string = 'id, contato_id, filial_id, dados, etapa:funil_etapas!etapa_id(slug)'
type NegocioMeu = {
  id: number; contato_id: number; filial_id: number | null
  dados: { _lead?: { kanban_status?: string | null } } | null; etapa: { slug: string } | null
}

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

  const { data: gravadas, error } = await supabase
    .from('empresa_usuarios')
    .update({ ausente, ausente_em: ausente ? new Date().toISOString() : null })
    .eq('empresa_id', empresaId).eq('usuario_id', user.id)
    .select('usuario_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (nadaGravado(gravadas)) return NextResponse.json({ error: 'Você não está na equipe desta empresa: a ausência não foi gravada.' }, { status: 404 })

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
    // Direto no negócio (a view `leads` caiu). A etapa vem embutida e o filtro das
    // finais é feito aqui, com a mesma regra da view (slug da etapa, senão o slug
    // guardado em dados._lead); as marcas de recebida/enviada vêm da conversa.
    const { data: linhas } = await supabase.from('negocios')
      .select(SELECT_MEUS)
      .eq('empresa_id', empresaId).eq('responsavel_id', user.id).eq('ativo', true)
    const meus = ((linhas ?? []) as unknown as NegocioMeu[]).filter((n) => {
      if (!slugs.length) return true
      // `not in` do SQL: sem slug nenhum a linha também ficava de fora.
      const slug = n.etapa?.slug ?? n.dados?._lead?.kanban_status ?? null
      return slug != null && !slugs.includes(slug)
    })
    // Falha ao ler as conversas = ninguém aguardando: não solta nada às cegas.
    const conversas = meus.length
      ? await conversasDosLeads(supabase as unknown as SupabaseClient, empresaId, meus).catch(() => new Map())
      : new Map()

    const pendentes = meus.filter((n) => aguardandoResposta(conversas.get(n.id) ?? {})).map((l) => l.id)
    if (pendentes.length) {
      // Condicional no responsável: se alguém já assumiu nesse meio-tempo, a
      // linha não é tocada. `responsavel_desde` fica no JSON, como a view fazia
      // (o null passava por jsonb_strip_nulls e não apagava a chave).
      const { data } = await supabase.from('negocios')
        .update({ responsavel_id: null })
        .in('id', pendentes).eq('responsavel_id', user.id).select('id')
      liberados = data?.length ?? 0
    }
  }

  return NextResponse.json({ ok: true, ausente, liberados })
}
