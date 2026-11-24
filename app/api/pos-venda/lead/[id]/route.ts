import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { diaNoFuso } from '@/lib/datas'
import { posvendaLigado, semTipo } from '@/lib/posvenda/ligado'
import { rotuloDoPasso } from '@/lib/posvenda/fila'

/**
 * A ABA PÓS-VENDA DO CARD DO LEAD (C7 bloco 2, 24/11/2026; docs/design-pos-venda.md §2.5.3).
 *
 * A régua inteira do cliente deste negócio (o que foi feito e o que falta, de todas as vendas dele), as notas de NPS
 * e os chamados. Quem pode abrir o negócio (RLS da sessão) vê a régua toda, como o desenho pede ("o vendedor vê a
 * régua inteira na ficha"); a leitura das tabelas do módulo é feita depois dessa conferência, pelo servidor.
 * Módulo desligado: 403 `modulo_desligado` (o painel some).
 */
type Embed<T> = T | T[] | null
const um = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Sem empresa' }, { status: 400 })
  const service = createServiceClient()
  if (!(await posvendaLigado(service, empresaId))) {
    return NextResponse.json({ error: 'O Pós-venda não está ligado nesta empresa.', code: 'modulo_desligado', modulo: 'posvenda' }, { status: 403 })
  }

  const id = Number((await ctx.params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Negócio inválido' }, { status: 400 })
  // A sessão enxerga este negócio? (RLS: empresa e lojas visíveis)
  const { data: neg } = await supabase.from('negocios').select('id, contato_id').eq('id', id).eq('empresa_id', empresaId).maybeSingle()
  if (!neg?.contato_id) return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })

  const s = semTipo(service)
  const [fuso, { data: acomp }, { data: notas }, { data: chamados }] = await Promise.all([
    fusoDaEmpresa(supabase, empresaId),
    s.from('posvenda_acompanhamentos')
      .select(`id, negocio_id, previsto_para, status, resultado, motivo, feito_em, tentativas, responsavel_id,
        passo:posvenda_cadencia_passos!passo_id(titulo, dia_offset, tipo_acao),
        jornada:posvenda_jornadas!jornada_id(status, cadencia:posvenda_cadencias!cadencia_id(nome))`)
      .eq('empresa_id', empresaId).eq('contato_id', neg.contato_id)
      .not('status', 'in', '(cancelado,juntado)')
      .order('previsto_para', { ascending: true }).limit(60),
    s.from('posvenda_respostas').select('id, nota, comentario, respondida_em, negocio_id')
      .eq('empresa_id', empresaId).eq('contato_id', neg.contato_id).order('respondida_em', { ascending: false }).limit(10),
    s.from('posvenda_chamados')
      .select('id, numero, titulo, prioridade, aberto_em, resolvido_em, sla_resolucao_vence, status:posvenda_chamado_status!status_id(nome, tipo)')
      .eq('empresa_id', empresaId).eq('contato_id', neg.contato_id).order('aberto_em', { ascending: false }).limit(10),
  ])

  type A = { id: number; negocio_id: number | null; previsto_para: string; status: string; resultado: string | null; motivo: string | null
    feito_em: string | null; tentativas: number; responsavel_id: string
    passo: Embed<{ titulo: string; dia_offset: number; tipo_acao: string }>; jornada: Embed<{ status: string; cadencia: Embed<{ nome: string }> }> }
  const linhas = (acomp ?? []) as unknown as A[]
  const ids = [...new Set(linhas.map((l) => l.responsavel_id))]
  const { data: pessoas } = ids.length ? await service.from('usuarios').select('id, nome').in('id', ids) : { data: [] }
  const nome = new Map((pessoas ?? []).map((p) => [p.id, p.nome]))
  const hoje = diaNoFuso(new Date(), fuso)

  return NextResponse.json({
    hoje,
    passos: linhas.map((l) => ({
      id: l.id,
      desteNegocio: l.negocio_id === id,
      passo: rotuloDoPasso(um(l.passo)?.dia_offset, um(l.passo)?.titulo ?? 'Passo'),
      regua: um(um(l.jornada)?.cadencia ?? null)?.nome ?? null,
      dia: diaNoFuso(new Date(l.previsto_para), fuso),
      status: l.status,
      resultado: l.resultado ?? l.motivo,
      feitoEm: l.feito_em ? diaNoFuso(new Date(l.feito_em), fuso) : null,
      responsavel: nome.get(l.responsavel_id) ?? null,
      tentativas: l.tentativas,
    })),
    notas: ((notas ?? []) as { id: number; nota: number; comentario: string | null; respondida_em: string }[])
      .map((n) => ({ id: n.id, nota: n.nota, comentario: n.comentario, dia: diaNoFuso(new Date(n.respondida_em), fuso) })),
    chamados: ((chamados ?? []) as unknown as { id: number; numero: number; titulo: string; prioridade: string; aberto_em: string
      resolvido_em: string | null; sla_resolucao_vence: string | null; status: Embed<{ nome: string; tipo: string }> }[])
      .map((c) => ({ id: c.id, numero: c.numero, titulo: c.titulo, prioridade: c.prioridade, status: um(c.status)?.nome ?? '',
        resolvido: um(c.status)?.tipo === 'resolvido', aberto: diaNoFuso(new Date(c.aberto_em), fuso),
        atrasado: !c.resolvido_em && !!c.sla_resolucao_vence && new Date(c.sla_resolucao_vence) < new Date() })),
  })
}
