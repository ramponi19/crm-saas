import { trackerEmpresa } from '@/lib/tracker/ctx'
import { calcularLeadsDetalhe } from '@/lib/tracker/rastreamento-detalhe'
import { LeadsDetalhe } from '@/components/tracker/leads-detalhe'

export const metadata = { title: 'Rastreamento · Leads · Tracker Ads' }
export const dynamic = 'force-dynamic'

export default async function LeadsDetalhePage() {
  const { empresaId } = await trackerEmpresa()
  const d = await calcularLeadsDetalhe(empresaId, 30)
  // Conexão Meta Marketing API entra no módulo #2 — por ora, não conectada.
  return <LeadsDetalhe total={d.total} contagem={d.contagem} leads={d.leads} metaConectado={false} />
}
