import { createServiceClient } from '@/lib/supabase/service'
import { AvisosManager, type Aviso } from '@/components/superadmin/avisos-manager'

export const metadata = { title: 'Avisos da plataforma' }

export default async function AvisosPage() {
  // Service role: superadmin gerencia avisos de toda a plataforma (rota trancada
  // no superadmin/layout).
  const svc = createServiceClient()

  const [{ data: avisos }, { data: empresas }, { data: planos }] = await Promise.all([
    svc.from('avisos_plataforma')
      .select('id, titulo, corpo, tom, alvo, alvo_valor, ativo, expira_em, created_at')
      .order('created_at', { ascending: false }),
    svc.from('empresas').select('id, nome').neq('demo', true).order('nome'),
    svc.from('planos_config').select('id, nome').order('ordem'),
  ])

  return (
    <div className="min-h-full bg-bg px-4 py-4 sm:px-8 sm:py-7">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-6">
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Avisos da plataforma</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">
            Banner exibido no topo do app dos tenants alvo — comunicados, manutenção, novidades.
          </p>
        </div>

        <AvisosManager
          avisosInit={(avisos ?? []) as Aviso[]}
          empresas={(empresas ?? []) as { id: number; nome: string }[]}
          planos={(planos ?? []) as { id: string; nome: string }[]}
        />
      </div>
    </div>
  )
}
