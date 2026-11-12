import { PublicosView } from './publicos-view'

export const metadata = { title: 'Públicos' }

/**
 * MÓDULO PÚBLICOS (12/11/2026). A trava "módulo ligado" desta tela é a do proxy (/publicos é o
 * endereço do módulo no manifesto); a API confere de novo (exigirModuloLigado). Dono e admin criam
 * e mudam; o vendedor vê os públicos da loja dele.
 */
export default function PublicosPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Públicos</h1>
        <p className="mt-1 text-sm text-ink-2">
          Listas salvas por regra, que se atualizam sozinhas — para a Transmissão e para as automações de “entrou no público”.
        </p>
      </header>
      <PublicosView />
    </div>
  )
}
