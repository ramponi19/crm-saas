import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { Calendario, type Evento } from '@/components/tracker/calendario'

export const metadata = { title: 'Compromissos · Tracker Ads' }
export const dynamic = 'force-dynamic'

export default async function CompromissosPage() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()

  const { data } = await db.from('tarefas')
    .select('id, titulo, tipo, vencimento, concluida, lead_id, leads(nome)')
    .eq('empresa_id', empresaId)
    .order('vencimento', { ascending: true, nullsFirst: false })
    .limit(500)

  type Row = { id: number; titulo: string | null; tipo: string | null; vencimento: string | null; concluida: boolean | null; leads: { nome: string | null } | { nome: string | null }[] | null }
  const iniciais: Evento[] = ((data ?? []) as Row[]).map((t) => {
    const lead = Array.isArray(t.leads) ? t.leads[0] : t.leads
    return { id: t.id, titulo: t.titulo || 'Sem título', tipo: t.tipo || 'tarefa', vencimento: t.vencimento, concluida: !!t.concluida, lead_nome: lead?.nome ?? null }
  })

  return <Calendario iniciais={iniciais} />
}
