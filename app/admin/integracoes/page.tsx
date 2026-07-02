import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrCreatePortalToken } from '@/lib/portal-token'
import IntegracoesView from './integracoes-view'

export const metadata = { title: 'Integrações' }

export default async function IntegracoesPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const svc = createServiceClient()

  const [{ data: empresa }, token, { data: importCfg }] = await Promise.all([
    supabase.from('empresas').select('slug, segmento').eq('id', empresaId).single(),
    getOrCreatePortalToken(svc, empresaId),
    svc.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'import_imoveis').maybeSingle(),
  ])

  const cfg = (importCfg?.valor as { feed_url?: string; ultima_importacao?: string } | null) ?? null

  return (
    <IntegracoesView
      slug={empresa?.slug ?? ''}
      segmento={empresa?.segmento ?? ''}
      token={token}
      feedUrlInicial={cfg?.feed_url ?? ''}
      ultimaImportacao={cfg?.ultima_importacao ?? null}
    />
  )
}
