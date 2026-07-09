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
  if (b.acao === 'aprovar') {
    await svc.from('garantias_assistencias').update({ status: 'aprovado', aprovado_em: agora }).eq('id', os.id)
    // Tarefa interna pro técnico (Meta-safe): não envia mensagem, só cria tarefa.
    const cliente = Array.isArray(os.clientes) ? os.clientes[0] : os.clientes
    await svc.from('tarefas').insert({
      empresa_id: os.empresa_id,
      responsavel_id: os.responsavel_tecnico_id ?? null,
      titulo: `Orçamento aprovado — iniciar reparo da OS ${os.protocolo ?? `#${os.id}`}${cliente?.nome ? ` (${cliente.nome})` : ''}`,
      tipo: 'ligacao',
      vencimento: agora,
    } as never)
  } else {
    await svc.from('garantias_assistencias').update({ status: 'reprovado', recusado_em: agora }).eq('id', os.id)
  }

  return NextResponse.json({ ok: true, acao: b.acao })
}
