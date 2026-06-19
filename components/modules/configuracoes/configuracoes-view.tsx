'use client'

import { useState } from 'react'
import type { EvolutionConfig, OfficialConfig } from '@/lib/whatsapp/types'
import { EvolutionCard } from './evolution-card'
import { OfficialCard } from './official-card'
import { DadosLojaCard } from './dados-loja-card'
import { PreferenciasCard } from './preferencias-card'

interface Props {
  evolution: EvolutionConfig | null
  official: OfficialConfig | null
  dadosLoja: Record<string, string> | null
  preferencias: Record<string, number | string> | null
}

function Section({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">{title}</h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

export function ConfiguracoesView({ evolution, official, dadosLoja, preferencias }: Props) {
  const [saved, setSaved] = useState<string | null>(null)

  function onSaved(label: string) {
    setSaved(label)
    setTimeout(() => setSaved(null), 3000)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie os dados da loja, integrações e preferências do sistema.
        </p>
      </div>

      {saved && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-sm rounded-lg px-4 py-3">
          ✓ {saved} salvo com sucesso.
        </div>
      )}

      {/* Loja */}
      <section className="space-y-4">
        <Section title="Loja" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <DadosLojaCard config={dadosLoja as any} onSaved={() => onSaved('Dados da loja')} />
          <PreferenciasCard config={preferencias as any} onSaved={() => onSaved('Preferências')} />
        </div>
      </section>

      {/* WhatsApp */}
      <section className="space-y-4">
        <Section title="WhatsApp" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <EvolutionCard config={evolution} onSaved={() => onSaved('Evolution API')} />
          <OfficialCard config={official} onSaved={() => onSaved('API Oficial do WhatsApp')} />
        </div>
      </section>
    </div>
  )
}
