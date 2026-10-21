import { requireEmpresaRole } from '@/lib/owner'

/**
 * Insights e Automações que vieram do /admin (21/10/2026): Visão geral,
 * Cadências, Distribuição, Lead scoring, Modelos, Respostas e Gatilhos. Só dono
 * e admin, como o layout do /admin exigia (várias não conferem o papel sozinhas).
 * O contêiner que rola é o mesmo do <main> do /admin: estas telas contam com ele.
 */
export default async function Gestao({ children }: { children: React.ReactNode }) {
  await requireEmpresaRole(['owner', 'admin'])
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">{children}</div>
}
