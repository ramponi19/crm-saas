import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui'
import { FipePicker } from '@/components/modules/veiculos/fipe-picker'

export const metadata = { title: 'Consulta FIPE' }

export default function ConsultaFipePage() {
  return (
    <>
      <Topbar title="Consulta FIPE" />
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[560px] space-y-4">
          <Card title="Valor de mercado (Tabela FIPE)">
            <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
              Selecione tipo, marca, modelo e ano para ver o valor FIPE do mês vigente.
            </p>
            <FipePicker />
          </Card>
        </div>
      </main>
    </>
  )
}
