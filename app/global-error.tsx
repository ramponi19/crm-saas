'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Última rede: erro de renderização do React que derruba a árvore inteira.
 *
 * Sem este arquivo, a tela branca é o único sinal — e ela não chega a ninguém.
 * Aqui o erro é reportado E a pessoa recebe uma saída, em vez de ficar olhando o
 * nada sem saber se o problema é a internet dela.
 *
 * Fora do design system de propósito: se o erro veio do próprio layout/tema,
 * importar componentes daqui poderia estourar de novo dentro da tela de erro.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error) }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F7F9FC', color: '#0B141A' }}>
        <div style={{ maxWidth: 460, margin: '18vh auto', padding: '0 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 19, fontWeight: 600, margin: 0 }}>Algo quebrou nesta tela</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#5A6672', marginTop: 10 }}>
            O erro foi registrado e vamos olhar. Nada do que você digitou foi enviado ao cliente.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 18, height: 38, padding: '0 20px', border: 'none', borderRadius: 8,
              background: '#0B141A', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Tentar de novo
          </button>
          {error.digest && (
            <p style={{ fontSize: 11, color: '#8A97A3', marginTop: 14 }}>Código do erro: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  )
}
