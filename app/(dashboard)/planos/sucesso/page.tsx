'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle } from 'lucide-react'

export default function CheckoutSucessoPage() {
  const router = useRouter()
  const params = useSearchParams()
  const sessionId = params.get('session_id')
  const [contador, setContador] = useState(5)

  useEffect(() => {
    if (!sessionId) { router.push('/planos'); return }
    const t = setInterval(() => {
      setContador(c => {
        if (c <= 1) { clearInterval(t); router.push('/dashboard'); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [sessionId, router])

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
