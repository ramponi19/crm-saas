import { VersaoDocumento } from '@/components/legal/versao-documento'

export const metadata = { title: 'Acordo de tratamento de dados' }

/**
 * DPA (acordo de tratamento de dados entre o cliente, controlador dos dados dos contatos dele, e o Nexus,
 * operador) — 18/11/2026. Aceito no cadastro com os termos e a privacidade. O TEXTO espera a decisão (c) do
 * Lucas; até lá a versão é "minuta" (lib/termos.ts). Com o texto final, a versão vai para DPA_VERSAO.
 */
export default function DpaPage() {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-12">
      <h1 className="text-[24px] font-bold tracking-[-0.02em] text-ink">Acordo de tratamento de dados (DPA)</h1>
      <VersaoDocumento documento="dpa" />
      <p className="mt-6 text-[14px] text-ink-2">O acordo de tratamento de dados do Nexus está em revisão; o texto final será publicado aqui.</p>
    </main>
  )
}
