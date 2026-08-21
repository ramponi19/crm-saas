import MetasPage from '@/app/(dashboard)/metas/page'

export const metadata = { title: 'Meta da empresa' }

/**
 * Meta da empresa é definição do DONO — saiu do menu do CRM e vive aqui
 * (pedido do Lucas, 21/08/2026), junto de Equipe, Relatórios e Conversão.
 *
 * Import, não redirect: o middleware manda `/metas` para cá, e um redirect nesta
 * página devolveria a bola para lá em loop.
 */
export default function AdminMetasPage() {
  return <MetasPage />
}
