import ConversaoPage from '@/app/(dashboard)/conversao/page'

export const metadata = { title: 'Conversão' }

/**
 * Conversão é leitura de GESTÃO, não ferramenta de atendimento: saiu do menu do CRM
 * e passou a viver aqui (pedido do Lucas, 21/08/2026), como Relatórios e Financeiro.
 *
 * Reaproveita a página do CRM por IMPORT, não por redirect: o middleware manda
 * `/conversao` para cá, e se esta página fosse um redirect de volta o par ficaria
 * batendo um no outro.
 */
export default function AdminConversaoPage() {
  return <ConversaoPage />
}
