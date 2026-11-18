'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, notify } from '@/components/ui'

export function AceiteForm({ versaoTermos, versaoPrivacidade, versaoDpa }: { versaoTermos: string; versaoPrivacidade: string; versaoDpa: string }) {
  const router = useRouter()
  const [marcado, setMarcado] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function aceitar() {
    setSalvando(true)
    const r = await fetch('/api/termos', { method: 'POST' })
    setSalvando(false)
    if (!r.ok) { notify.bad('Não foi possível registrar o aceite. Tente de novo.'); return }
    router.replace('/entrar')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div className="w-full max-w-[440px] rounded-card border border-line bg-card p-6">
        <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Termos de uso, privacidade e DPA</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          Para continuar usando o Nexus, leia e aceite os <Link href="/termos" target="_blank" className="underline">termos de uso</Link> (versão {versaoTermos}),
          a <Link href="/privacy" target="_blank" className="underline">política de privacidade</Link> (versão {versaoPrivacidade})
          e o <Link href="/dpa" target="_blank" className="underline">acordo de tratamento de dados</Link> (versão {versaoDpa}).
        </p>
        <label className="mt-4 flex items-start gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} className="mt-0.5" />
          Li e aceito os termos de uso, a política de privacidade e o acordo de tratamento de dados.
        </label>
        <Button className="mt-5 w-full" disabled={!marcado} loading={salvando} onClick={aceitar}>Aceitar e continuar</Button>
      </div>
    </div>
  )
}
