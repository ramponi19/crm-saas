import './globals.css'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import Providers from './providers'
import { ZapSidebar } from '@/components/zapintel/zap-sidebar'
import { PreviewBanner } from '@/components/tracker/preview-banner'

export const metadata = { title: 'ZapIntel' }

/**
 * ZapIntel — módulo de inteligência de conversas (add-on pago) dentro do crm-saas.
 * Isolado: tema próprio escopado em .zi-root; reusa o login/empresa do CRM e roda
 * a análise sobre as conversas reais (lead_mensagens). Acesso só com o add-on
 * ativo (tracker_addons.zapintel_ativo); super admin sempre entra (preview).
 */
export default async function ZapIntelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { empresaId } = await trackerEmpresa()
  // Status do add-on na tabela própria do complemento (tracker_addons), não em
  // empresas — mantém o módulo removível sem alterar o schema do CRM.
  const [{ data: usuario }, { data: empresa }, { data: addon }] = await Promise.all([
    user ? supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single() : Promise.resolve({ data: null }),
    rastrDb().from('empresas').select('nome').eq('id', empresaId).single(),
    rastrDb().from('tracker_addons').select('zapintel_ativo').eq('empresa_id', empresaId).maybeSingle(),
  ])

  const liberado = !!usuario?.is_super_admin || !!(addon as { zapintel_ativo?: boolean })?.zapintel_ativo
  const previewAtivo = !!usuario?.is_super_admin && Number((await cookies()).get('nexus_preview_empresa')?.value) === empresaId
  if (!liberado) {
    return (
      <div className="zi-root" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 16px', background: 'linear-gradient(135deg,#7c5cfc,#4f46e5)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 22 }}>Z</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>ZapIntel</h1>
          <p style={{ fontSize: 14, color: 'var(--dim)', lineHeight: 1.7 }}>Este é um recurso adicional que ainda não está habilitado para a sua empresa. Fale com o suporte para ativar a inteligência de conversas por IA.</p>
          <a href="/dashboard" style={{ marginTop: 20, display: 'inline-block', background: '#7c5cfc', color: '#fff', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Voltar ao CRM</a>
        </div>
      </div>
    )
  }

  return (
    <div className="zi-root" style={{ display: 'flex', minHeight: '100dvh' }}>
      <Providers>
        <ZapSidebar empresaNome={empresa?.nome ?? 'Minha empresa'} />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', height: '100dvh', padding: '28px 24px' }}>
          {previewAtivo && <PreviewBanner empresaNome={empresa?.nome ?? 'empresa'} to="zapintel" />}
          {children}
        </main>
      </Providers>
    </div>
  )
}
