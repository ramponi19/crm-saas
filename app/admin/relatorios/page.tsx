import RelatoriosPage from '@/app/(dashboard)/relatorios/page'

export const metadata = { title: 'Relatórios' }

// Relatórios é gestão → também acessível pelo /admin. Reaproveita o roteador
// único por segmento de /relatorios (imob → relatório imob; demais → BI).
export default function AdminRelatoriosPage() {
  return <RelatoriosPage />
}
