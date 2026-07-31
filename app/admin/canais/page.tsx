import { CanaisView } from '@/components/modules/canais/canais-view'

export const metadata = { title: 'Canais de atendimento' }

export default function CanaisPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Canais de atendimento</h1>
        <p className="mt-1 text-sm text-ink-2">
          Conecte WhatsApp, Instagram e Messenger para receber e responder tudo em um lugar.
          No WhatsApp, o número continua funcionando no seu celular.
        </p>
      </header>

      {/* O App ID é público (roda no navegador dentro do conector da Meta). */}
      <CanaisView appId={process.env.NEXT_PUBLIC_META_APP_ID ?? ''} />
    </div>
  )
}
