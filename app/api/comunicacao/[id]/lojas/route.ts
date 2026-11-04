import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * "TAMBÉM EM <OUTRA LOJA>" NA CONVERSA (Inbox, 04/11/2026).
 *
 * A conversa mora na loja do canal. O mesmo contato pode conversar com a outra
 * loja — e o vendedor desta loja não enxerga aquela conversa (RLS). Como no card
 * do lead (lib/card-do-lead.ts, "outrasLojas"), só o NOME da outra loja sai daqui:
 * primeiro a conversa é lida com a sessão (se a RLS não a devolve, 404), depois a
 * chave de serviço procura o mesmo contato nas outras lojas da MESMA empresa.
 * Nenhum conteúdo da outra conversa é devolvido.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const conversaId = Number(id)
  if (!Number.isInteger(conversaId) || conversaId <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: conversa } = await db.from('conversas').select('id, empresa_id, contato_id, filial_id').eq('id', conversaId).maybeSingle()
  if (!conversa || conversa.contato_id == null) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  const svc = createServiceClient()
  let q = svc.from('conversas').select('filial_id, filial:filiais(nome)')
    .eq('empresa_id', conversa.empresa_id).eq('contato_id', conversa.contato_id)
  q = conversa.filial_id == null ? q.not('filial_id', 'is', null) : q.or(`filial_id.is.null,filial_id.neq.${conversa.filial_id}`)
  const { data } = await q
  const nomes = new Map<number, string>()
  for (const l of (data ?? []) as unknown as { filial_id: number | null; filial: { nome: string } | null }[]) {
    if (l.filial_id != null && l.filial?.nome) nomes.set(l.filial_id, l.filial.nome)
  }
  return NextResponse.json({ outrasLojas: [...nomes].map(([filialId, nome]) => ({ filialId, nome })) })
}
