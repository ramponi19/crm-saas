import { TransmissaoView } from './transmissao-view'

export const metadata = { title: 'Transmissão' }

/**
 * MÓDULO TRANSMISSÃO (10/11/2026). A trava "módulo ligado" desta tela é a do proxy
 * (/transmissao é o endereço do módulo no manifesto); a API confere de novo
 * (exigirModuloLigado). Dono e admin criam e disparam; o vendedor vê o resultado.
 */
export default function TransmissaoPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Transmissão</h1>
        <p className="mt-1 text-sm text-ink-2">
          Um modelo aprovado pela Meta para uma lista de contatos da loja, pelo WhatsApp da loja — e quem recebeu, leu e respondeu.
        </p>
      </header>
      <TransmissaoView />
    </div>
  )
}
