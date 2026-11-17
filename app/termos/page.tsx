export const metadata = { title: 'Termos de uso' }

/**
 * Termos de uso do Nexus — o TEXTO espera a decisão (c) do Lucas. Quando ele vier, entra aqui e a versão
 * vai para TERMOS_VERSAO (lib/termos.ts), o que liga o aceite no cadastro e na tela /aceite.
 */
export default function TermosPage() {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-12">
      <h1 className="text-[24px] font-bold tracking-[-0.02em] text-ink">Termos de uso</h1>
      <p className="mt-3 text-[14px] text-ink-2">Os termos de uso do Nexus serão publicados aqui.</p>
    </main>
  )
}
