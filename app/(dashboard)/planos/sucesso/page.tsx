'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui'

type Estado = 'verificando' | 'confirmado' | 'erro'

export default function CheckoutSucessoPage() {
  const router = useRouter()
  const params = useSearchParams()
  const sessionId = params.get('session_id')
  const [estado, setEstado] = useState<Estado>('verificando')
  const [contador, setContador] = useState(5)

  useEffect(() => {
    if (!sessionId) { router.push('/planos'); return }

    fetch(`/api/stripe/verificar-sessao?session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(json => {
        if (json.ok) {
          setEstado('confirmado')
        } else {
          setEstado('erro')
        }
      })
      .catch(() => setEstado('erro'))
  }, [sessionId, router])

  useEffect(() => {
    if (estado !== 'confirmado') return
    const t = setInterval(() => {
      setContador(c => {
        if (c <= 1) { clearInterval(t); router.push('/dashboard'); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [estado, router])

  if (estado === 'verificando') {
    return (
      <div className="flex h-full items-center justify-center bg-bg px-6">
        <div className="flex items-center gap-2 text-[13px] text-ink-3">
          <Loader2 size={16} strokeWidth={1.7} className="animate-spin" />
          Verificando pagamento…
        </div>
      </div>
    )
  }

  if (estado === 'erro') {
    return (
      <div className="flex h-full items-center justify-center bg-bg px-6">
        <div className="w-full max-w-sm rounded-card border border-line bg-card p-8 text-center">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-bad-soft">
            <XCircle size={32} strokeWidth={1.7} className="text-bad" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">Não foi possível confirmar</h1>
          <p className="mt-2 text-[13px] text-ink-2">
            Não conseguimos verificar o pagamento. Se você foi cobrado, entre em contato com o suporte.
          </p>
          <div className="mt-6 flex justify-center">
            <Button onClick={() => router.push('/planos')}>Voltar aos planos</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-8 text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-ok-soft">
          <CheckCircle size={32} strokeWidth={1.7} className="text-ok" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">Assinatura confirmada!</h1>
        <p className="mt-2 text-[13px] text-ink-2">
          Seu plano foi ativado. Você será redirecionado ao dashboard em {contador} segundo{contador !== 1 ? 's' : ''}.
        </p>
        <div className="mt-6 flex justify-center">
          <Button onClick={() => router.push('/dashboard')}>Ir para o dashboard</Button>
        </div>
      </div>
    </div>
  )
}
