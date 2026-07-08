import type { Metadata } from 'next'
import { requireSuperAdmin } from '@/lib/superadmin'
import { DesignShowcase } from './showcase'

export const metadata: Metadata = { title: 'Design System' }

// Contrato visual do produto (Direção Precisão). Visível só ao super admin.
export default async function DesignPage() {
  await requireSuperAdmin()
  return <DesignShowcase />
}
