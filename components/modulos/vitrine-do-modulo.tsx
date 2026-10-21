import { notFound } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { VITRINES } from '@/lib/modulos-vitrine'
import { Topbar } from '@/components/layout/topbar'
import { Vitrine } from './vitrine'

/**
 * Monta a vitrine de um módulo no servidor: quem está vendo (superadmin, dono
 * ou equipe), se o segmento tem a tela e se já há pedido aberto.
 *
 * Usada em dois caminhos, com a mesma tela:
 *   - módulo desligado: o proxy reescreve /agenda → /vitrine/agenda (o endereço
 *     na barra continua /agenda);
 *   - segmento sem a tela: a própria página (Agenda, Executivo) mostra a
 *     vitrine em vez de mandar para o dashboard.
 */
export async function VitrineDoModulo({ href }: { href: string }) {
  const modulo = VITRINES[href]
  if (!modulo) notFound()

  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: eu }, { data: vinculo }, { data: empresa }, { data: pedido }] = await Promise.all([
    supabase.from('usuarios').select('is_super_admin').eq('id', user?.id ?? '').maybeSingle(),
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user?.id ?? '').eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('empresas').select('preset_onboarding').eq('id', empresaId).maybeSingle(),
    // Pedidos só são lidos pela chave de serviço (RLS fechada); filtrado pela empresa da sessão.
    createServiceClient().from('modulo_pedidos').select('pedido_em')
      .eq('empresa_id', empresaId).eq('modulo', href).is('atendido_em', null).maybeSingle(),
  ])

  const papel = eu?.is_super_admin ? 'superadmin' as const
    : vinculo?.role === 'owner' || vinculo?.role === 'admin' ? 'dono' as const
    : 'equipe' as const
  const cap = SEGMENTOS[normalizarSegmento(empresa?.preset_onboarding)].capacidades
  const suportado = !modulo.exige || modulo.exige.some((c) => Boolean(cap[c]))

  return (
    <>
      <Topbar title={modulo.nome} />
      <Vitrine href={href} modulo={modulo} papel={papel} suportado={suportado} pedidoEm={pedido?.pedido_em ?? null} />
    </>
  )
}
