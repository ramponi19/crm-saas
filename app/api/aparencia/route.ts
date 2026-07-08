import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { contrastRatio, type WlMenu } from '@/lib/wl-menu'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { data: vinculo } = await supabase
    .from('empresa_usuarios').select('role')
    .eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle()

  const { data: usuario } = await supabase.from('usuarios').select('is_super_admin').eq('id', user.id).single()
  const isAdmin = usuario?.is_super_admin || vinculo?.role === 'owner' || vinculo?.role === 'admin'
  if (!isAdmin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { wl_menu?: WlMenu | null }
  const wl = body.wl_menu ?? null

  if (wl && !['clara', 'escura', 'custom'].includes(wl.preset)) {
    return NextResponse.json({ error: 'Preset inválido' }, { status: 400 })
  }
  // Guard-rail de contraste no custom (defesa no servidor).
  if (wl?.preset === 'custom') {
    const c1 = contrastRatio(wl.texto ?? '', wl.fundo ?? '')
    const c2 = contrastRatio(wl.ativo_texto ?? '', wl.ativo_fundo ?? '')
    if ((c1 != null && c1 < 4.5) || (c2 != null && c2 < 4.5)) {
      return NextResponse.json({ error: 'Contraste abaixo de 4.5:1' }, { status: 422 })
    }
  }

  // Verificado o papel em código; grava via service client (evita depender da RLS de UPDATE de empresas).
  const service = createServiceClient()
  const { error } = await service.from('empresas').update({ wl_menu: wl as never }).eq('id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
