import { ModelosView } from '@/components/modules/modelos/modelos-view'

export const metadata = { title: 'Modelos de mensagem' }

export default function ModelosPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Modelos de mensagem</h1>
        <p className="mt-1 text-sm text-ink-2">
          Mensagens aprovadas pela Meta para retomar conversa parada há mais de 24 horas.
        </p>
      </header>
      <ModelosView />
    </div>
  )
}
