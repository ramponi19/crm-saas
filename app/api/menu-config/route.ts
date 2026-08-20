import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

/**
 * Nada é fixo — e a lista vazia aqui é intencional.
 *
 * A rota descartava `/dashboard` do "ocultar", mas a tela (`meu-menu-view`) já
 * oferece o botão para ele: o dono clicava, salvava, e o item continuava no menu
 * sem nenhuma explicação. Dos dois lados possíveis, este é o que o próprio
 * comentário da tela defende: ocultar é só de MENU (a rota segue acessível) e o
 * ajuste vive em /admin, fora do menu do CRM, então não há como se trancar fora.
 */
const PROTEGIDOS: string[] = []

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const [{ data: vinculo }, { data: usuario }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single(),
  ])
  const isAdmin = usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    hidden?: string[]
    labels?: Record<string, string>
    ordem?: Record<string, string[]>
  }
  const hidden = (body.hidden ?? []).filter((h) => typeof h === 'string' && !PROTEGIDOS.includes(h))
  const labels: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.labels ?? {})) {
    if (typeof v === 'string' && v.trim()) labels[k] = v.trim().slice(0, 40)
  }
  /**
   * ORDEM: grupo -> hrefs, mais `__grupos` com a ordem das caixas.
   *
   * Guardada crua, sem conferir se cada href existe: o menu muda com plano,
   * papel e segmento, e href que hoje não aparece pode voltar amanhã. Quem
   * resolve isso é o `resolverMenu`, que só reordena o que está na tela e ignora
   * o resto — validar aqui apagaria a escolha do dono a cada mudança de plano.
   */
  const ordem: Record<string, string[]> = {}
  for (const [grupo, hrefs] of Object.entries(body.ordem ?? {})) {
    if (!Array.isArray(hrefs)) continue
    const limpos = hrefs.filter((h): h is string => typeof h === 'string').slice(0, 80)
    if (limpos.length) ordem[grupo.slice(0, 40)] = limpos
  }
  const menu_config = { hidden, labels, ordem }

  const service = createServiceClient()
  const { error } = await service.from('empresas').update({ menu_config: menu_config as never }).eq('id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
