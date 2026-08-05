import { trackerEmpresa } from '@/lib/tracker/ctx'
import { calcularAnalytics } from '@/lib/tracker/analytics'
import { AnalyticsView } from '@/components/tracker/analytics-view'

export const metadata = { title: 'Analytics · Tracker Ads' }
export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const { empresaId } = await trackerEmpresa()
  const a = await calcularAnalytics(empresaId, 30)
  return <AnalyticsView a={a} />
}
