import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

interface EtapaIn {
  id?: number
  label: string
  cor: string
  tipo: string
  ativo: boolean
}

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'etapa'
}

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

  const body = await req.json().catch(() => ({})) as { etapas?: EtapaIn[]; funilId?: number }
  const etapas = body.etapas ?? []
  if (!Array.isArray(etapas) || etapas.length === 0) return NextResponse.json({ error: 'Nenhuma etapa' }, { status: 400 })
  const TIPOS = ['normal', 'negociacao', 'ganho', 'perdido']

  const service = createServiceClient()

  // Funil alvo: informado ou o padrão da empresa (Fase 4.1). Etapas pertencem a um funil.
  let funilId = body.funilId
  if (!funilId) {
    const { data: padrao } = await service.from('funis').select('id').eq('empresa_id', empresaId).eq('padrao', true).maybeSingle()
    funilId = padrao?.id
  }
  if (!funilId) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 400 })

  // slugs existentes NESTE funil (unique é por funil_id, slug)
  const { data: exist } = await service.from('funil_etapas').select('slug').eq('funil_id', funilId)
  const slugs = new Set((exist ?? []).map((r) => r.slug))

  for (let i = 0; i < etapas.length; i++) {
    const e = etapas[i]
    const tipo = TIPOS.includes(e.tipo) ? e.tipo : 'normal'
    if (e.id) {
      // slug NÃO muda (leads.kanban_status depende dele)
      const { error } = await service.from('funil_etapas')
        .update({ label: e.label, cor: e.cor, tipo, ordem: i, ativo: e.ativo })
        .eq('id', e.id).eq('empresa_id', empresaId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      let slug = slugify(e.label)
      let n = 2
      while (slugs.has(slug)) slug = `${slugify(e.label)}_${n++}`
      slugs.add(slug)
      const { error } = await service.from('funil_etapas')
        .insert({ empresa_id: empresaId, funil_id: funilId, slug, label: e.label, cor: e.cor, tipo, ordem: i, ativo: e.ativo })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
