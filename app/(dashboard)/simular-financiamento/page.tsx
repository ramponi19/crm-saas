import { Topbar } from '@/components/layout/topbar'
import { SimularFinanciamentoView } from '@/components/modules/simular-financiamento/simular-financiamento-view'

export const metadata = { title: 'Simular financiamento' }

export default function SimularFinanciamentoPage() {
  return (
    <>
      <Topbar title="Simular financiamento" />
      <SimularFinanciamentoView />
    </>
  )
}
