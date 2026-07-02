import PlanosPage from '@/app/(dashboard)/planos/page'

export const metadata = { title: 'Planos' }

// Planos vive DENTRO do /admin (gestão de assinatura), sem sair pro CRM.
export default function AdminPlanosPage() {
  return <PlanosPage />
}
