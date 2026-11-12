import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { exigirModuloLigado } from '@/lib/modulo-ligado'

/**
 * O ACOMPANHAMENTO DE UMA TRANSMISSÃO (módulo Transmissão, 10/11/2026), contato a contato:
 * situação do envio, entregue/lida (mensagens.status_entrega, que o webhook de status da
 * Meta mantém), respondeu, e o motivo de quem ficou fora ou falhou. Pela RLS de quem pede:
 * o vendedor vê a da loja dele, ninguém vê a de outra empresa.
 *
 * GET ?situacao=enviada|respondida|falhou|pulada|pendente&pagina=N
 */
const POR_PAGINA = 100

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const trava = await exigirModuloLigado(empresaId, 'transmissao')
  if (trava) return trava

  const id = Number((await params).id) || 0
  const u = new URL(req.url)
  const situacao = u.searchParams.get('situacao')
  const pagina = Math.max(0, Number(u.searchParams.get('pagina')) || 0)

  const { data: t } = await supabase.from('transmissoes')
    .select('id, nome, filial_id, modelo_id, status, filtro, publico_id, parametros, agendada_para, iniciada_em, pausada_em, concluida_em, total, created_at')
    .eq('id', id).eq('empresa_id', empresaId).maybeSingle()
  if (!t) return NextResponse.json({ error: 'Transmissão não encontrada' }, { status: 404 })

  let q = supabase.from('transmissao_envios')
    .select('id, contato_id, negocio_id, status, motivo, enviada_em, respondida_em, mensagem_id, contato:contatos!contato_id(nome, telefone)', { count: 'exact' })
    .eq('transmissao_id', id)
  if (situacao === 'respondida') q = q.not('respondida_em', 'is', null)
  else if (situacao === 'pendente') q = q.in('status', ['pendente', 'enviando'])
  else if (situacao && ['enviada', 'falhou', 'pulada'].includes(situacao)) q = q.eq('status', situacao)
  const [{ data: envios, count, error }, { data: numeros }] = await Promise.all([
    q.order('respondida_em', { ascending: false, nullsFirst: false }).order('id').range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1),
    supabase.rpc('transmissao_numeros', { p_ids: [id] }),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Entregue/lida da mensagem de cada envio (sem chave estrangeira: uma leitura pelo id).
  const msgIds = (envios ?? []).map((e) => e.mensagem_id as number | null).filter((x): x is number => !!x)
  const { data: msgs } = msgIds.length
    ? await supabase.from('mensagens').select('id, status_entrega, erro_envio').in('id', msgIds)
    : { data: [] }
  const porMsg = new Map((msgs ?? []).map((m) => [m.id as number, m as { status_entrega: string | null; erro_envio: string | null }]))
  type Contato = { nome: string | null; telefone: string | null }
  const um = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x)

  return NextResponse.json({
    transmissao: t,
    numeros: (numeros ?? [])[0] ?? null,
    total: count ?? 0,
    pagina,
    porPagina: POR_PAGINA,
    envios: (envios ?? []).map((e) => {
      const m = e.mensagem_id ? porMsg.get(e.mensagem_id as number) : undefined
      const c = um(e.contato as unknown as Contato | Contato[] | null)
      return {
        id: e.id, negocio_id: e.negocio_id, nome: c?.nome ?? null,
        // Só o final do número: a tela de acompanhamento não precisa do telefone inteiro.
        final: (c?.telefone ?? '').replace(/\D/g, '').slice(-4) || null,
        status: e.status, motivo: e.motivo ?? m?.erro_envio ?? null, enviada_em: e.enviada_em,
        entrega: m?.status_entrega ?? null, respondida_em: e.respondida_em,
      }
    }),
  })
}
