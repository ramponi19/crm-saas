import { cookies } from 'next/headers'
import { Sora, Inter } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { TrackerShell } from '@/components/tracker/tracker-shell'
import { PreviewBanner } from '@/components/tracker/preview-banner'

/**
 * Complemento Tracker Ads — área /tracker.
 *
 * Isolado do CRM: visual e fontes próprios, escopados a esta subárvore. Reusa o
 * login e a empresa ativa do crm-saas (não cria auth nova). Qualquer usuário
 * logado e vinculado a uma empresa entra.
 */
const sora = Sora({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-sora', display: 'swap' })
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter', display: 'swap' })

export const metadata = { title: 'Tracker Ads' }

export default async function TrackerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  // trackerEmpresa resolve a empresa (preview do super admin > impersonation >
  // vínculo > 1ª empresa) e redireciona se não houver sessão/empresa.
  const { userId, empresaId } = await trackerEmpresa()
  const { data: usuario } = await supabase
    .from('usuarios').select('nome, email, is_super_admin').eq('id', userId).single()

  // O status do add-on vive na tabela própria do complemento (tracker_addons),
  // não em empresas — assim o módulo é removível sem tocar no schema do CRM.
  // Lido via service-role; nome ainda vem de empresas (dado do CRM).
  const [{ data: empresa }, { data: addon }] = await Promise.all([
    rastrDb().from('empresas').select('nome').eq('id', empresaId).single(),
    rastrDb().from('tracker_addons').select('tracker_ativo').eq('empresa_id', empresaId).maybeSingle(),
  ])

  // Está prevendo (super admin com cookie apontando esta empresa)?
  const previewAtivo = !!usuario?.is_super_admin && Number((await cookies()).get('nexus_preview_empresa')?.value) === empresaId

  // Gating do add-on: só entra quem tem o Nexus Tracker habilitado. Super admin
  // sempre pode acessar (para configurar/prever). Senão, tela de indisponível.
  const liberado = !!usuario?.is_super_admin || !!addon?.tracker_ativo
  if (!liberado) {
    return (
      <div className={`${sora.variable} ${inter.variable}`} style={{ background: '#eef1f5', minHeight: '100dvh' }}>
        <div className="mx-auto grid min-h-[100dvh] max-w-[440px] place-items-center px-6 text-center">
          <div>
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[16px] text-white" style={{ background: '#00a884', fontFamily: 'var(--font-sora)', fontWeight: 700, fontSize: 22 }}>7</div>
            <h1 className="text-[20px] font-bold" style={{ color: '#111e26', fontFamily: 'var(--font-sora)' }}>Nexus Tracker</h1>
            <p className="mt-2 text-[14px]" style={{ color: '#3a4b57' }}>
              Este é um recurso adicional que ainda não está habilitado para a sua empresa.
              Fale com o suporte para ativar o rastreamento de anúncios ponta a ponta.
            </p>
            <a href="/dashboard" className="mt-5 inline-block rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: '#00a884' }}>Voltar ao CRM</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${sora.variable} ${inter.variable}`}>
      <TrackerShell
        userName={usuario?.nome ?? usuario?.email ?? 'Usuário'}
        empresaNome={empresa?.nome ?? 'Minha empresa'}
      >
        {previewAtivo && <PreviewBanner empresaNome={empresa?.nome ?? 'empresa'} to="tracker" />}
        {children}
      </TrackerShell>
    </div>
  )
}
