import { Topbar } from '@/components/layout/topbar'
import { SimularParcelaView } from '@/components/modules/simular-parcela/simular-parcela-view'

export const metadata = { title: 'Simular Parcela' }

export default function SimularParcelaPage() {
  return (
    <>
      <Topbar eyebrow="VENDAS · CALCULADORA" title="Simular Parcela" />
      <SimularParcelaView />
    </>
  )
}
