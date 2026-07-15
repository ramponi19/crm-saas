import { requireSuperAdmin } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { AssistenteAdminView } from './assistente-admin-view'

export const metadata = { title: 'Assistente Nexus' }

export default async function SuperAdminAssistentePage() {
  await requireSuperAdmin()
  const svc = createServiceClient()

  const [{ data: cfg }, { data: empresas }] = await Promise.all([
    svc.from('assistente_config').select('ativo, limite_por_min, modelo, system_extra').eq('id', 1).maybeSingle(),
    svc.from('empresas').select('id, nome').order('nome'),
  ])

  const config = {
    ativo: cfg?.ativo ?? true,
    limite_por_min: cfg?.limite_por_min ?? 20,
    modelo: cfg?.modelo ?? 'gemini-2.0-flash',
    system_extra: cfg?.system_extra ?? '',
  }

  return (
    <AssistenteAdminView
      config={config}
      empresas={(empresas ?? []) as { id: number; nome: string }[]}
      keyConfigurada={!!process.env.GEMINI_API_KEY}
    />
  )
}
