import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { resolverMenu } from '@/lib/menu'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { carregarConfigEmpresa, camadasParaMenu } from '@/lib/empresa-config'

// Rota neutra pós-login: decide o destino conforme o papel do usuário.
// Super admin → painel global; dono/admin da empresa → painel de administração;
// vendedor/técnico → dashboard operacional do tenant.
export default async function EntrarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (usuario?.is_super_admin) {
    redirect('/superadmin')
  }

  // Não é super admin: precisa de vínculo ativo com uma empresa
  const { data: vinculo } = await supabase
    .from('empresa_usuarios')
    .select('empresa_id, role')
    .eq('usuario_id', user.id)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()

  if (!vinculo) redirect('/register')

  // Dono/admin abrem direto na Visão geral (era o /admin até 21/10/2026); demais no CRM.
  if (vinculo.role === 'owner' || vinculo.role === 'admin') {
    redirect('/visao-geral')
  }

  // Saúde: a Agenda é a tela inicial do segmento (consultas do dia).
  const { data: emp } = await supabase
    .from('empresas')
    .select('segmento:preset_onboarding, preset_onboarding, plano, permissoes')
    .eq('id', vinculo.empresa_id).maybeSingle()
  // Tela inicial do segmento (clínica abre a agenda, não o dashboard). Vem do
  // contrato: um segmento novo declara a sua sem tocar nesta rota.
  const inicial = SEGMENTOS[normalizarSegmento(emp?.segmento)].capacidades.telaInicial
  if (inicial) redirect(inicial)

  /**
   * A tela inicial tem de ser uma que o funcionário VÊ.
   *
   * Ia direto para /dashboard. Agora que o dono pode ocultar o Dashboard no
   * Menu do CRM, isso deixaria o vendedor começando numa tela sem link no menu
   * — escondida para todo efeito, menos justamente na hora de entrar.
   *
   * Resolve o menu com as mesmas camadas da sidebar e usa o primeiro item que
   * sobrou. Sem nenhum item visível (menu todo oculto), cai no /dashboard: é
   * melhor abrir algo do que deixar o login sem destino.
   */
  const cfg = await carregarConfigEmpresa(supabase, vinculo.empresa_id, emp?.preset_onboarding ?? null)
  const { overrides, configDono, segOverride, instalados } = camadasParaMenu(cfg)
  const grupos = resolverMenu({
    segmento: normalizarSegmento(emp?.segmento),
    plano: emp?.plano ?? undefined,
    role: vinculo.role ?? 'vendedor',
    isSuperAdmin: false,
    overrides,
    configDono,
    instalados,
    // Sem a ordem do superadmin, como sempre foi aqui: o primeiro item de quem
    // entra não muda com a troca de fonte (21/10/2026).
    segOverride: segOverride ? { ...segOverride, menuLayout: undefined } : undefined,
  })
  const primeiro = grupos.flatMap((g) => g.items).find((i) => !i.locked)?.href
  redirect(primeiro ?? '/dashboard')
}
