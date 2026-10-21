import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui'
import { FipePicker } from '@/components/modules/veiculos/fipe-picker'

export const metadata = { title: 'Consulta FIPE' }

/**
 * A consulta FIPE avulsa mora em Avaliações (etapa 0, 21/10/2026): é a mesma
 * régua que a avaliação usa, para quem quer o valor sem abrir uma avaliação.
 * Saiu do menu lateral; abre pelo botão em Avaliações e pelo ⌘K. O endereço
 * antigo (/consulta-fipe) responde 308 para cá.
 */
export default function ConsultaFipePage() {
  return (
    <>
      <Topbar title="Consulta FIPE" />
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[560px] space-y-4">
          <Link href="/avaliacoes" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink">
            <ArrowLeft size={14} strokeWidth={1.7} /> Avaliações
          </Link>
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
