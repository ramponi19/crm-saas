'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-lg font-semibold text-[#16212E]">Algo deu errado</h2>
      <p className="text-sm text-[#788698] max-w-sm">
        Ocorreu um erro inesperado. Tente novamente ou entre em contato com o suporte se o problema persistir.
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 text-sm font-medium text-white bg-[#16212E] rounded-lg hover:bg-[#22303F] transition-colors"
      >
        Tentar novamente
      </button>
    </div>
  )
}
