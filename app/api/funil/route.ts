import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

interface EtapaIn {
  id?: number
  label: string
  cor: string
  tipo: string
  ativo: boolean
  probabilidade?: number
  camposObrigatorios?: string[]
}

const CAMPOS_VALIDOS = ['telefone', 'valor_estimado', 'responsavel_id', 'produto_interessado']

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

  const body = await req.json().catch(() => ({})) as {
    etapas?: EtapaIn[]
    funilId?: number
    /** Etapas a remover, com o destino dos leads que estiverem nelas. */
    excluir?: { id: number; moverPara?: string | null }[]
  }
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
    const prob = Math.max(0, Math.min(100, Math.round(Number(e.probabilidade) || 0)))
    const campos = Array.isArray(e.camposObrigatorios) ? e.camposObrigatorios.filter(c => CAMPOS_VALIDOS.includes(c)) : []
    if (e.id) {
      // slug NÃO muda (leads.kanban_status depende dele)
      const { error } = await service.from('funil_etapas')
        .update({ label: e.label, cor: e.cor, tipo, ordem: i, ativo: e.ativo, probabilidade: prob, campos_obrigatorios: campos })
        .eq('id', e.id).eq('empresa_id', empresaId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      let slug = slugify(e.label)
      let n = 2
      while (slugs.has(slug)) slug = `${slugify(e.label)}_${n++}`
      slugs.add(slug)
      const { error } = await service.from('funil_etapas')
        .insert({ empresa_id: empresaId, funil_id: funilId, slug, label: e.label, cor: e.cor, tipo, ordem: i, ativo: e.ativo, probabilidade: prob, campos_obrigatorios: campos })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  /**
   * EXCLUSÃO DE ETAPA — o lead vem antes da organização da loja.
   *
   * `leads.kanban_status` guarda o SLUG da etapa. Apagar a etapa sem cuidar dos
   * leads os deixaria apontando para algo inexistente: eles sumiriam do kanban
   * sem erro nenhum na tela, e o que desaparece é cliente que ainda não comprou.
   *
   * Por isso, em ordem: valida o destino, MOVE os leads, confere que não sobrou
   * nenhum e só então apaga a etapa. Se o move falhar, a etapa continua de pé —
   * é melhor uma etapa a mais do que um lead invisível.
   *
   * Roda DEPOIS do laço acima porque as etapas que ficam já foram gravadas com a
   * ordem nova; o destino, portanto, existe e está atualizado.
   */
  const paraExcluir = Array.isArray(body.excluir) ? body.excluir : []
  const excluidas: string[] = []

  for (const alvo of paraExcluir) {
    if (!alvo?.id) continue

    // A etapa é desta empresa e deste funil? Sem isto, um id de outra empresa
    // apagaria etapa alheia — o service client ignora RLS de propósito.
    const { data: etapa } = await service.from('funil_etapas')
      .select('id, slug, label').eq('id', alvo.id)
      .eq('empresa_id', empresaId).eq('funil_id', funilId).maybeSingle()
    if (!etapa) return NextResponse.json({ error: 'Etapa não encontrada neste funil' }, { status: 404 })

    // Nunca deixar o funil sem etapa: o kanban ficaria sem nenhuma coluna e não
    // haveria para onde um lead novo nascer.
    const { count: restantes } = await service.from('funil_etapas')
      .select('*', { count: 'exact', head: true })
      .eq('funil_id', funilId).neq('id', alvo.id)
    if ((restantes ?? 0) === 0) {
      return NextResponse.json({ error: 'O funil não pode ficar sem etapas' }, { status: 400 })
    }

    const { count: comLeads } = await service.from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId).eq('ativo', true).eq('kanban_status', etapa.slug)

    if ((comLeads ?? 0) > 0) {
      const destino = (alvo.moverPara ?? '').trim()
      if (!destino) {
        return NextResponse.json(
          { error: `"${etapa.label}" tem ${comLeads} lead(s). Informe para qual etapa eles vão.` },
          { status: 400 },
        )
      }
      // O destino tem de existir NESTE funil — senão trocaríamos um status órfão
      // por outro.
      const { data: dest } = await service.from('funil_etapas')
        .select('slug').eq('funil_id', funilId).eq('slug', destino).maybeSingle()
      if (!dest) return NextResponse.json({ error: 'Etapa de destino não existe neste funil' }, { status: 400 })

      const { error: erroMove } = await service.from('leads')
        .update({ kanban_status: destino })
        .eq('empresa_id', empresaId).eq('ativo', true).eq('kanban_status', etapa.slug)
      if (erroMove) return NextResponse.json({ error: `Falha ao mover os leads: ${erroMove.message}` }, { status: 500 })

      // Confere ANTES de apagar. Um lead que tenha entrado na etapa entre a
      // contagem e o update seria perdido de vista.
      const { count: sobrou } = await service.from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresaId).eq('ativo', true).eq('kanban_status', etapa.slug)
      if ((sobrou ?? 0) > 0) {
        return NextResponse.json(
          { error: `Ainda há ${sobrou} lead(s) em "${etapa.label}" — etapa não foi excluída.` },
          { status: 409 },
        )
      }
    }

    const { error: erroDel } = await service.from('funil_etapas')
      .delete().eq('id', alvo.id).eq('empresa_id', empresaId)
    if (erroDel) return NextResponse.json({ error: erroDel.message }, { status: 500 })
    excluidas.push(etapa.label)
  }

  return NextResponse.json({ ok: true, excluidas })
}
