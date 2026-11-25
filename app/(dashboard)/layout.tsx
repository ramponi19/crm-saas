import { contarPosVendaDoDia } from '@/lib/posvenda/contador'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileTopbar } from '@/components/layout/mobile-topbar'
import { NotificationProvider } from '@/components/layout/notification-provider'
import { TempoRealEmpresa } from '@/components/layout/tempo-real-empresa'
import { ImpersonationBanner } from '@/components/superadmin/impersonation-banner'
import { AvisoRotinas } from '@/components/superadmin/aviso-rotinas'
import { AvisosBanner, type AvisoBanner } from '@/components/layout/avisos-banner'
import { LimiteBanner } from '@/components/layout/limite-banner'
import { SituacaoBanner } from '@/components/layout/situacao-banner'
import { agora } from '@/lib/datas'
import { aceitouVigentes } from '@/lib/termos'
import { situacaoDaEmpresa, type EmpresaSituacao } from '@/lib/situacao-empresa'
import { createClient } from '@/lib/supabase/server'
import { getImpersonation } from '@/lib/supabase/server'
import { EmpresaProvider } from '@/lib/empresa-context'
import { RotulosProvider } from '@/components/layout/rotulos-context'
import { FerramentasProvider } from '@/components/layout/ferramentas-context'
import { resolverFerramentas } from '@/lib/menu'
import { SessionGuard } from '@/components/layout/session-guard'
import { SentryUsuario } from '@/components/layout/sentry-usuario'
import { AssistenteWidget } from '@/components/assistente/assistente-widget'
import { resolveTheme, type WlMenu } from '@/lib/wl-menu'
import { carregarConfigEmpresa, camadasParaMenu, ligadosDaEmpresa, vocabulario } from '@/lib/empresa-config'
import { contextoDaSessao, destinoSemEmpresa, permsDoContexto } from '@/lib/sessao'
import { AvisoSomenteLeitura } from '@/components/layout/aviso-somente-leitura'
import { RegistrarAcessoPlataforma } from '@/components/superadmin/registrar-acesso-plataforma'
import { SeletorEmpresa } from '@/components/layout/seletor-empresa'
import { AvisoModuloIndisponivel } from '@/components/layout/aviso-modulo-indisponivel'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { FusoProvider } from '@/components/fuso-provider'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Termos e privacidade com versão nova (lib/termos.ts; desligado sem as versões): aceita antes de usar.
  if (!(await aceitouVigentes(supabase, user.id))) redirect('/aceite')

  const { data: usuarioRaw } = await supabase
    .from('usuarios')
    .select('nome, is_super_admin')
    .eq('id', user.id)
    .single()
  const usuario = usuarioRaw as unknown as { nome: string; is_super_admin: boolean } | null

  // Impersonação: super admin operando como uma empresa específica.
  const impersonation = await getImpersonation()
  // Cargo, permissões, empresa ativa e somente leitura numa chamada só (etapa 1.1b).
  const ctx = await contextoDaSessao()

  // Resolver a empresa do contexto: impersonada (super admin) ou a do vínculo.
  let empresa: { nome: string; plano?: string | null; wl_cor: string | null; wl_logo_url: string | null; wl_menu?: unknown; permissoes?: unknown } | null = null
  let role = 'owner'
  let plano: string | undefined
  let empresaId: number | undefined

  if (impersonation) {
    // Super admin impersonando: busca os dados da empresa impersonada diretamente.
    const { data: empImp } = await supabase
      .from('empresas')
      .select('nome, plano, ...empresa_branding(wl_cor:cor, wl_logo_url:logo_url, wl_menu:sidebar), permissoes')
      .eq('id', impersonation.empresaId)
      .single()
    empresa = empImp ?? { nome: impersonation.nome, wl_cor: null, wl_logo_url: null }
    role = 'owner' // super admin tem controle total na empresa impersonada
    plano = empImp?.plano ?? undefined
    empresaId = impersonation.empresaId
  } else {
    // Fluxo normal (etapa 1.1b): a empresa vem do contexto da sessão (get_empresa_id: empresa ativa, ou o
    // único vínculo). Antes era um .single() em empresa_usuarios sem filtro de empresa: com 0 linhas (superadmin
    // com a impersonação vencida) o PostgREST respondia 406, e com 2 vínculos a empresa era qualquer uma.
    if (!ctx?.empresa_id) redirect(destinoSemEmpresa(ctx))
    const { data: empAtiva } = await supabase
      .from('empresas')
      .select('id, nome, plano, ...empresa_branding(wl_cor:cor, wl_logo_url:logo_url, wl_menu:sidebar), permissoes')
      .eq('id', ctx.empresa_id)
      .maybeSingle()
    const empTyped = empAtiva as unknown as { nome: string; plano: string | null; wl_cor: string | null; wl_logo_url: string | null; wl_menu: WlMenu | null; permissoes: unknown } | null
    empresa = empTyped
    role = ctx.papel ?? 'vendedor'
    plano = empTyped?.plano ?? undefined
    empresaId = ctx.empresa_id
  }

  // Situação da assinatura (17/11/2026): teste acabando, pagamento atrasado, modo somente leitura.
  const { data: situacaoRow } = empresaId
    ? await supabase.from('empresas').select('status, stripe_status, trial_ends_at, demo').eq('id', empresaId).maybeSingle()
    : { data: null }
  const situacao = situacaoDaEmpresa(situacaoRow as EmpresaSituacao | null, agora())

  // Avisos da plataforma (banner) — filtra por alvo: todos | plano | empresa.
  const { data: avisosRaw } = await supabase
    .from('avisos_plataforma')
    .select('id, titulo, corpo, tom, alvo, alvo_valor, ativo, expira_em')
    .eq('ativo', true)
    .order('created_at', { ascending: false })
  const avisos: AvisoBanner[] = ((avisosRaw ?? []) as Array<{
    id: number; titulo: string; corpo: string; tom: string; alvo: string; alvo_valor: string | null; expira_em: string | null
  }>)
    .filter(a => !a.expira_em || new Date(a.expira_em) > new Date())
    .filter(a =>
      a.alvo === 'todos' ||
      (a.alvo === 'plano' && a.alvo_valor === plano) ||
      (a.alvo === 'empresa' && a.alvo_valor === String(empresaId ?? ''))
    )
    .map(a => ({ id: a.id, titulo: a.titulo, corpo: a.corpo, tom: a.tom }))

  // Leads novos = negócios ativos na etapa de slug 'novo' (a view `leads` caiu).
  const { count: leadsCount } = await supabase
    .from('negocios')
    .select('id, etapa:funil_etapas!etapa_id!inner(slug)', { count: 'exact', head: true })
    .eq('ativo', true)
    .eq('etapa.slug', 'novo')

  // Enforcement de permissão do papel: esconde itens que o papel não pode ver.
  // As permissões vêm do cargo (etapa 1.1b); a tela antiga de Permissões alimenta os cargos pela ponte do banco.
  const perms = permsDoContexto(ctx)
  const permHidden: string[] = []
  if (!perms.verFinanceiro) permHidden.push('/financeiro')
  if (!perms.verRelatorios) permHidden.push('/relatorios')

  // Camadas do resolverMenu, lidas das tabelas da empresa (empresa_menu,
  // empresa_modulos) — ver lib/empresa-config.ts.
  const cfg = await carregarConfigEmpresa(supabase, empresaId ?? 0)
  const { overrides: menuOverrides, configDono: menuConfig, base, instalados, rotulos } = camadasParaMenu(cfg, permHidden)
  // Ferramentas fora do menu (Simular parcela, Check IMEI, FIPE): mesmas camadas do
  // menu, entregues às telas-casa e ao ⌘K.
  // O fuso da empresa: toda tela abaixo mostra e corta datas nele (lib/datas, useFuso).
  const fuso = await fusoDaEmpresa(supabase, empresaId)
  // Pós-venda instalado: passos atrasados + de hoje (os da pessoa; dono e administrador, os da equipe — RLS).
  const posvendaCount = empresaId && instalados['/pos-venda'] ? await contarPosVendaDoDia(supabase, empresaId, fuso) : 0

  const ferramentas = resolverFerramentas({
    plano, role,
    isSuperAdmin: usuario?.is_super_admin ?? false,
    overrides: menuOverrides, configDono: menuConfig, base, instalados,
  }).map(({ href, label, rota }) => ({ href, label, rota }))

  return (
    <EmpresaProvider>
      <FusoProvider fuso={fuso}>
      {/* Uma assinatura de tempo real por aba (sino, título, avisos, Comunicação). */}
      <TempoRealEmpresa empresaId={empresaId}>
      {/* Erro que chega sem dono custa uma investigação inteira — ver o
          componente. Fica no layout porque vale para TODAS as telas logadas. */}
      <SentryUsuario
        id={user.id}
        nome={usuario?.nome ?? 'sem nome'}
        papel={role}
        empresa={empresa?.nome}
      />
      <div className="flex h-[100dvh] overflow-hidden bg-bg">
        <Sidebar
          userName={usuario?.nome ?? user.email ?? 'Usuário'}
          /*
            "Vendedor" vira o nome que a empresa usa — "Corretor" na imobiliária.
            O ranking já chamava a mesma pessoa de corretor: sem isto, o rodapé do
            menu e a tabela do placar discordavam sobre o cargo de quem está logado.
          */
          userRole={
            role === 'owner' ? 'Proprietário'
              : role === 'admin' ? 'Administrador'
              : role === 'tecnico' ? 'Técnico'
              : vocabulario(cfg).equipe
          }
          userEmpresa={empresa?.nome}
          leadsCount={leadsCount ?? 0}
          posvendaCount={posvendaCount}
          empresaLogo={empresa?.wl_logo_url ?? null}
          isSuperAdmin={usuario?.is_super_admin ?? false}
          role={role}
          plano={plano}
          theme={resolveTheme(empresa?.wl_menu as WlMenu | null, empresa?.wl_cor)}
          overrides={menuOverrides}
          configDono={menuConfig}
          base={base}
          instalados={instalados}
        />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Cabeçalho mobile: ☰ no canto abre o menu completo em gaveta (só no celular). */}
          <MobileTopbar
            empresaNome={empresa?.nome}
            empresaLogo={empresa?.wl_logo_url ?? null}
            userName={usuario?.nome ?? user.email ?? 'Usuário'}
            plano={plano}
            role={role}
            isSuperAdmin={usuario?.is_super_admin ?? false}
            leadsCount={leadsCount ?? 0}
            posvendaCount={posvendaCount}
            overrides={menuOverrides}
            configDono={menuConfig}
            base={base}
            instalados={instalados}
          />
          <Suspense fallback={null}><AvisoModuloIndisponivel /></Suspense>
          {impersonation && <ImpersonationBanner empresaNome={impersonation.nome} />}
          {usuario?.is_super_admin && <Suspense fallback={null}><AvisoRotinas /></Suspense>}
          {impersonation && <RegistrarAcessoPlataforma />}
          {ctx && ctx.empresas.length > 1 && !impersonation && <SeletorEmpresa empresas={ctx.empresas} atual={ctx.empresa_id} />}
          {ctx?.cargo?.somente_leitura && <AvisoSomenteLeitura />}
          {avisos.length > 0 && <AvisosBanner avisos={avisos} />}
          <SituacaoBanner situacao={situacao} podePagar={role === 'owner' || role === 'admin'} />
          <LimiteBanner />
          {/*
            Os rótulos da empresa chegam à barra do topo de cada tela.
            Mesma precedência do menu: base, depois superadmin, depois o dono —
            senão o menu diria "Pipeline" e o topo da mesma página, "Leads".
          */}
          <RotulosProvider valor={rotulos}>
            <FerramentasProvider valor={ferramentas} ligados={[...ligadosDaEmpresa(cfg)]}>
              <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
            </FerramentasProvider>
          </RotulosProvider>
        </div>
      </div>
      <NotificationProvider empresaNome={empresa?.nome ? `${empresa.nome} — CRM` : undefined} />
      <SessionGuard />
      <AssistenteWidget />
      </TempoRealEmpresa>
      </FusoProvider>
    </EmpresaProvider>
  )
}
