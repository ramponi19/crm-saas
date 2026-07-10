import Image from 'next/image'

export const metadata = { title: 'Sem conexão' }

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <Image src="/icons/icon-192.png" alt="Nexus" width={64} height={64} className="rounded-[16px]" />
      <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">Você está sem conexão</h1>
      <p className="max-w-[320px] text-[13.5px] text-ink-2">
        Não conseguimos carregar esta tela agora. Verifique sua internet e tente de novo.
      </p>
    </div>
  )
}
