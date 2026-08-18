import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Aprovação/recusa do orçamento de uma OS pelo cliente, via link público (token).
 * Meta-safe: não envia nada — só muda o status e cria uma TAREFA interna pro técnico.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const b = await req.json().catch(() => ({})) as { acao?: string }
  if (b.acao !== 'aprovar' && b.acao !== 'recusar') {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { data: os } = await svc
    .from('garantias_assistencias')
    .select('id, empresa_id, protocolo, status, responsavel_tecnico_id, aprovado_em, recusado_em, clientes(nome)')
    .eq('token', token).maybeSingle()
  if (!os) return NextResponse.json({ error: 'Ordem não encontrada' }, { status: 404 })
  if (os.aprovado_em || os.recusado_em) {
    return NextResponse.json({ error: 'Este orçamento já foi respondido.' }, { status: 409 })
  }

  const agora = new Date().toISOString()
  /**
   * Claim atômico, não "conferi antes".
   *
   * A checagem acima lê e o UPDATE escreve depois: dois cliques do cliente (ou o
   * duplo POST de um retry) passavam pelos dois e criavam DUAS tarefas de reparo
   * para a mesma OS. A condição vai para dentro do UPDATE — só um vence.
   */
  const claim = await svc.from('garantias_assistencias')
    .update({
      status: b.acao === 'aprovar' ? 'aprovado' : 'reprovado',
      ...(b.acao === 'aprovar' ? { aprovado_em: agora } : { recusado_em: agora }),
    } as never)
    .eq('id', os.id).is('aprovado_em', null).is('recusado_em', null)
    .select('id').maybeSingle()
  if (!claim.data) {
    return NextResponse.json({ error: 'Este orçamento já foi respondido.' }, { status: 409 })
  }

  if (b.acao === 'aprovar') {
    // Tarefa interna pro técnico (Meta-safe): não envia mensagem, só cria tarefa.
    const cliente = Array.isArray(os.clientes) ? os.clientes[0] : os.clientes
    await svc.from('tarefas').insert({
      empresa_id: os.empresa_id,
      responsavel_id: os.responsavel_tecnico_id ?? null,
      titulo: `Orçamento aprovado — iniciar reparo da OS ${os.protocolo ?? `#${os.id}`}${cliente?.nome ? ` (${cliente.nome})` : ''}`,
      tipo: 'ligacao',
      vencimento: agora,
    } as never)
  }

  return NextResponse.json({ ok: true, acao: b.acao })
}
