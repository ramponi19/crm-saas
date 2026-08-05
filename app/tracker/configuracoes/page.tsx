import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { SettingsTracker } from '@/components/tracker/settings-tracker'

export const metadata = { title: 'Configurações · Tracker Ads' }
export const dynamic = 'force-dynamic'

export default async function ConfiguracoesPage() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const [{ data: empresa }, { data: canais }, { data: membros }, { data: cfg }] = await Promise.all([
    db.from('empresas').select('nome, status').eq('id', empresaId).single(),
    db.from('canais_conectados').select('tipo, nome_exibicao, status').eq('empresa_id', empresaId),
    db.from('empresa_usuarios').select('role, ativo, usuarios(nome, email)').eq('empresa_id', empresaId),
    db.from('rastreamento_config').select('public_token, meta_pixel_id, capi_ativo').eq('empresa_id', empresaId).maybeSingle(),
  ])

  type M = { role: string; ativo: boolean | null; usuarios: { nome: string | null; email: string | null } | { nome: string | null; email: string | null }[] | null }
  const equipe = ((membros ?? []) as M[]).map((m) => {
    const u = Array.isArray(m.usuarios) ? m.usuarios[0] : m.usuarios
    return { nome: u?.nome ?? '—', email: u?.email ?? null, role: m.role, ativo: m.ativo !== false }
  })

  return (
    <div className="h-full min-h-0">
      <SettingsTracker
        empresaNome={(empresa as { nome?: string })?.nome ?? 'Minha empresa'}
        empresaStatus={(empresa as { status?: string | null })?.status ?? null}
        canais={(canais ?? []) as { tipo: string; nome_exibicao: string | null; status: string | null }[]}
        equipe={equipe}
        pixel={{
          public_token: (cfg as { public_token?: string | null })?.public_token ?? null,
          meta_pixel_id: (cfg as { meta_pixel_id?: string | null })?.meta_pixel_id ?? null,
          capi_ativo: !!(cfg as { capi_ativo?: boolean })?.capi_ativo,
        }}
        appUrl={appUrl}
      />
    </div>
  )
}
