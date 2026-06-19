'use client'

import { useState } from 'react'
import type { EvolutionConfig, OfficialConfig } from '@/lib/whatsapp/types'
import { EvolutionCard } from './evolution-card'
import { OfficialCard } from './official-card'

interface Props {
  evolution: EvolutionConfig | null
  official: OfficialConfig | null
}

export function ConfiguracoesView({ evolution, official }: Props) {
  const [saved, setSaved] = useState<string | null>(null)

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie integrações e preferências do sistema.
        </p>
      </div>

      {saved && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-sm rounded-lg px-4 py-3">
          ✓ {saved} salvo com sucesso.
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
            WhatsApp
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <EvolutionCard config={evolution} onSaved={() => setSaved('Evolution API')} />
          <OfficialCard config={official} onSaved={() => setSaved('API Oficial do WhatsApp')} />
        </div>
      </section>
    </div>
  )
}
