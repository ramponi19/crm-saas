import { SimularParcelaView } from '@/components/modules/simular-parcela/simular-parcela-view'

export const metadata = { title: 'Simular parcela' }

/**
 * Simular parcela é aba de Orçamentos (etapa 0, 21/10/2026): é ferramenta de
 * quem está cotando com o cliente na frente, não área própria do menu. O
 * endereço antigo (/simular-parcela) responde 308 para cá — ver next.config.ts.
 * A barra do topo e as abas vêm do layout de Orçamentos.
 */
export default function SimularParcelaPage() {
  return <SimularParcelaView />
}
