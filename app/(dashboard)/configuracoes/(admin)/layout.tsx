import { requireEmpresaRole } from '@/lib/owner'

/**
 * Só dono e admin, como o layout do /admin exigia antes da navegação nova
 * (21/10/2026). Várias destas telas contavam com essa guarda e não conferem o
 * papel sozinhas — por isso ela fica no grupo, não em cada página.
 */
export default async function SoDonoOuAdmin({ children }: { children: React.ReactNode }) {
  await requireEmpresaRole(['owner', 'admin'])
  return children
}
