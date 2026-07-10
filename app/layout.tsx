import type { Metadata } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

// Precisão: Geist é a fonte do produto; mono só p/ códigos (font-mono).
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
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
      className={`${geist.variable} ${mono.variable}`}
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
