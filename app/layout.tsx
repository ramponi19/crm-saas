import type { Metadata } from 'next'
import { Geist, Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

// Precisão: fonte única do produto.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
// TEMP ÁPICE — remover ao fim da Fase 2 (views não migradas ainda usam font-serif/font-mono).
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' })
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: 'Nexus',
    template: '%s | Nexus',
  },
  description: 'Nexus — CRM por segmento: venda com processo, cresça com controle.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="pt-BR"
      className={`${geist.variable} ${fraunces.variable} ${jakarta.variable} ${mono.variable}`}
    >
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            classNames: {
              toast: 'font-sans text-sm',
            },
          }}
        />
      </body>
    </html>
  )
}
