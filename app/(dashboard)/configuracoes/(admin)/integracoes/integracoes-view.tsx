'use client'


import { MessageCircle } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { CanaisView } from '@/components/modules/canais/canais-view'
import { IntegracaoCard } from '@/components/modules/configuracoes/integracao-card'
import { IntegracoesImoveis } from '@/components/modules/imoveis/integracoes-imoveis'

export default function IntegracoesView({ slug, portais, tokenPortal = null, feedUrlInicial, ultimaImportacao, appId }: {
  slug: string; feedUrlInicial: string; ultimaImportacao: string | null
  /** Capacidade `integraPortais` (módulo Imóveis ligado): mostra portais, site e importação. */
  portais: boolean
  /** Token de portal e site (nasce na instalação do Imóveis). Null = ainda não gerado. */
  tokenPortal?: string | null
  /** App ID da Meta — público, roda no navegador dentro do conector oficial. */
  appId: string
}) {
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Integrações" />
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[860px]">
          <p className="mb-6 text-[14px] text-ink-2">
            {portais ? 'Conecte seus canais, seu site e os portais — capte leads de todos os lados.' : 'Conecte seus canais de atendimento ao CRM.'}
          </p>

          <div className="space-y-4">
            {/* CONECTAR ACONTECE AQUI, não noutra tela.
                Havia dois menus para a mesma coisa — "Canais" e "Integrações" — e
                o card daqui só empurrava para um terceiro lugar
                (/admin/configuracoes). Quem quer ligar o WhatsApp abria os três
                até achar o botão. Agora o conector de verdade mora aqui. */}
            <IntegracaoCard icon={MessageCircle} titulo="Canais de atendimento" desc="WhatsApp, Instagram e Facebook — receba e responda mensagens dentro do CRM. No WhatsApp, o número continua funcionando no seu celular.">
              <CanaisView appId={appId} />
            </IntegracaoCard>

            {/* Portais, site e importação: do módulo Imóveis, com a capacidade `integraPortais`. */}
            {portais && (
              <IntegracoesImoveis slug={slug} tokenPortal={tokenPortal} feedUrlInicial={feedUrlInicial} ultimaImportacao={ultimaImportacao} />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
