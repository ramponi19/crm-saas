import { VersaoDocumento } from '@/components/legal/versao-documento'

export const metadata = { title: 'Termos de uso' }

/**
 * Termos de uso do Nexus — o TEXTO espera a decisão (c) do Lucas. Até lá a versão é "minuta" (lib/termos.ts),
 * e é ela que o cadastro registra no aceite. Com o texto final, a versão vai para TERMOS_VERSAO.
 */
export default function TermosPage() {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-12">
      <h1 className="text-[24px] font-bold tracking-[-0.02em] text-ink">Termos de uso</h1>
      <VersaoDocumento documento="termos" />
      <p className="mt-6 text-[14px] text-ink-2">Os termos de uso do Nexus estão em revisão; o texto final será publicado aqui.</p>
    </main>
  )
}
