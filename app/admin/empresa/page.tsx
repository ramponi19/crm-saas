import { requireEmpresaRole } from '@/lib/owner'
import EmpresaConfigView from './empresa-config-view'

export const metadata = { title: 'Minha empresa' }

export default async function EmpresaPage() {
  await requireEmpresaRole(['owner', 'admin'])
  return <EmpresaConfigView />
}
