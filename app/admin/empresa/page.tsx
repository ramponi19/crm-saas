import EmpresaConfigPage from '@/app/(dashboard)/empresa/page'

export const metadata = { title: 'Minha empresa' }

// Reaproveita a tela de configurações da empresa dentro do painel /admin.
// (EmpresaProvider é fornecido pelo layout de /admin.)
export default function AdminEmpresaPage() {
  return <EmpresaConfigPage />
}
