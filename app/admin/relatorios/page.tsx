import RelatoriosPage from '@/app/(dashboard)/relatorios/page'

export const metadata = { title: 'Relatórios' }

// Relatórios é gestão → também acessível pelo /admin. Reaproveita o roteador
// único por segmento de /relatorios (imob → relatório imob; demais → BI).
export default function AdminRelatoriosPage({ searchParams }: {
  searchParams: Promise<{ de?: string; ate?: string; corretor?: string }>
}) {
  // Repassa o recorte da URL: sem isto, filtrar por /admin/relatorios nao faria nada.
  return <RelatoriosPage searchParams={searchParams} />
}
