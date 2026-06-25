'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, XCircle } from 'lucide-react'

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
      <div className="flex flex-col h-full bg-[#0A111E] items-center justify-center">
        <div className="text-sm text-[#5C6E84]">Verificando pagamento…</div>
      </div>
    )
  }

  if (estado === 'erro') {
    return (
      <div className="flex flex-col h-full bg-[#0A111E] items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-[rgba(215,40,47,0.1)] flex items-center justify-center mx-auto mb-6">
            <XCircle size={36} className="text-[#D7282F]" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Não foi possível confirmar</h1>
          <p className="text-sm text-[#5C6E84] mb-6">
            Não conseguimos verificar o pagamento. Se você foi cobrado, entre em contato com o suporte.
          </p>
          <button
            onClick={() => router.push('/planos')}
            className="flex items-center gap-2 mx-auto bg-[#D7282F] text-white text-sm font-semibold px-6 py-2.5 rounded-[10px] hover:bg-[#B91C1C] transition-colors"
          >
            Voltar aos planos
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0A111E] items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-[rgba(34,197,94,0.1)] flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={36} className="text-[#22C55E]" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Assinatura confirmada!</h1>
        <p className="text-sm text-[#5C6E84] mb-6">
          Seu plano foi ativado. Você será redirecionado ao dashboard em {contador} segundo{contador !== 1 ? 's' : ''}.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 mx-auto bg-[#D7282F] text-white text-sm font-semibold px-6 py-2.5 rounded-[10px] hover:bg-[#B91C1C] transition-colors"
        >
          Ir para o dashboard
        </button>
      </div>
    </div>
  )
}
