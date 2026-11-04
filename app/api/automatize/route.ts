import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { nadaGravado } from '@/lib/linhas-afetadas'
import { CHAVE_PAUSA } from '@/lib/automacoes'

/**
 * AUTOMATIZE NO FUNIL (04/11/2026): o que cada etapa faz sozinha.
 *
 * GET  ?funil=ID  → por etapa: automações (gatilho "entrou na etapa") e cadências da
 *                   etapa, com quantos negócios estão na fila/inscritos e quantos
 *                   executaram hoje; os modelos APROVADOS e a equipe (para o formulário);
 *                   se a empresa pausou tudo; se quem pede pode editar.
 * POST {op}       → 'ligar' (automação/cadência), 'criar' (automação a partir da etapa),
 *                   'pausar' (todas as automações da empresa). Só dono/admin: a RLS de
 *                   automacoes/cadencias/configuracoes_sistema barra o resto, e a rota
 *                   confere as linhas gravadas (0 linhas = 403, nunca "ok").
 *
 * Tudo com o cliente do USUÁRIO: o vendedor vê (pela RLS da loja dele) e não edita.
 */

const ACOES = ['criar_tarefa', 'notificar_gestor', 'enviar_modelo', 'atribuir_responsavel'] as const
type Acao = typeof ACOES[number]

function inicioDoDiaSp(): string {
  const agora = new Date(Date.now() - 3 * 3_600_000)
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()) + 3 * 3_600_000).toISOString()
}

async function papel(supabase: Awaited<ReturnType<typeof createClient>>, empresaId: number, userId: string) {
  const { data } = await supabase.from('empresa_usuarios').select('role')
    .eq('empresa_id', empresaId).eq('usuario_id', userId).eq('ativo', true).maybeSingle()
  return (data as { role?: string } | null)?.role ?? null
}

export async function GET(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const funilId = Number(new URL(req.url).searchParams.get('funil')) || null

  const role = await papel(supabase, empresaId, user.id)
  const hoje = inicioDoDiaSp()

  let qEtapas = supabase.from('funil_etapas').select('id, slug, label, ordem').eq('empresa_id', empresaId).eq('ativo', true).order('ordem')
  if (funilId) qEtapas = qEtapas.eq('funil_id', funilId)
  const [{ data: etapas }, { data: autos }, { data: cads }, { data: pausa }, { data: modelos }, { data: equipe }] = await Promise.all([
    qEtapas,
    supabase.from('automacoes').select('id, etapa_slug, etapa_id, gatilho, acao, ativo, espera_dias, modelo_id, config')
      .eq('empresa_id', empresaId).eq('gatilho', 'entrou_na_etapa').order('id'),
    supabase.from('cadencias').select('id, nome, ativo, gatilho_etapa_slug').eq('empresa_id', empresaId).order('id'),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', CHAVE_PAUSA).maybeSingle(),
    supabase.from('modelos_mensagem').select('id, nome, idioma, status, corpo').eq('empresa_id', empresaId).eq('status', 'aprovado').order('nome'),
    supabase.from('empresa_usuarios').select('usuario_id, usuarios(nome)').eq('empresa_id', empresaId).eq('ativo', true),
  ])

  const autoIds = (autos ?? []).map((a) => a.id as number)
  const cadIds = (cads ?? []).map((c) => c.id as number)
  // Contagens pela RLS (o vendedor conta só a loja dele).
  const [{ data: fila }, { data: feitasHoje }, { data: inscritos }, { data: cadHoje }] = await Promise.all([
    autoIds.length ? supabase.from('automacao_execucoes').select('automacao_id').in('automacao_id', autoIds).eq('status', 'agendada') : Promise.resolve({ data: [] }),
    autoIds.length ? supabase.from('automacao_execucoes').select('automacao_id').in('automacao_id', autoIds).eq('status', 'executada').gte('executada_em', hoje) : Promise.resolve({ data: [] }),
    cadIds.length ? supabase.from('cadencia_inscricoes').select('cadencia_id').in('cadencia_id', cadIds).eq('status', 'ativa') : Promise.resolve({ data: [] }),
    cadIds.length ? supabase.from('cadencia_execucoes').select('inscricao_id, cadencia_inscricoes!inner(cadencia_id)').gte('created_at', hoje) : Promise.resolve({ data: [] }),
  ])
  const conta = <T,>(lista: T[] | null | undefined, chave: (x: T) => number) => {
    const m = new Map<number, number>()
    for (const x of lista ?? []) m.set(chave(x), (m.get(chave(x)) ?? 0) + 1)
    return m
  }
  const nFila = conta(fila as { automacao_id: number }[], (x) => x.automacao_id)
  const nHoje = conta(feitasHoje as { automacao_id: number }[], (x) => x.automacao_id)
  const nInsc = conta(inscritos as { cadencia_id: number }[], (x) => x.cadencia_id)
  const nCadHoje = conta(cadHoje as unknown as { cadencia_inscricoes: { cadencia_id: number } }[], (x) => x.cadencia_inscricoes.cadencia_id)

  const porEtapa = (etapas ?? []).map((e) => ({
    slug: e.slug as string,
    label: e.label as string,
    automacoes: (autos ?? []).filter((a) => a.etapa_slug === e.slug || a.etapa_id === e.id).map((a) => ({
      id: a.id, acao: a.acao, ativo: a.ativo, espera_dias: a.espera_dias ?? 0, modelo_id: a.modelo_id, config: a.config,
      na_fila: nFila.get(a.id as number) ?? 0, executadas_hoje: nHoje.get(a.id as number) ?? 0,
    })),
    cadencias: (cads ?? []).filter((c) => c.gatilho_etapa_slug === e.slug).map((c) => ({
      id: c.id, nome: c.nome, ativo: c.ativo, inscritos: nInsc.get(c.id as number) ?? 0, executadas_hoje: nCadHoje.get(c.id as number) ?? 0,
    })),
  }))

  return NextResponse.json({
    podeEditar: role === 'owner' || role === 'admin',
    pausado: !!(pausa?.valor as { pausado?: boolean } | null)?.pausado,
    etapas: porEtapa,
    modelos: modelos ?? [],
    equipe: ((equipe ?? []) as unknown as { usuario_id: string; usuarios: { nome: string | null } | null }[])
      .map((u) => ({ id: u.usuario_id, nome: u.usuarios?.nome ?? '—' })),
  })
}

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const role = await papel(supabase, empresaId, user.id)
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Só o dono ou um admin mexe nas automações.' }, { status: 403 })
  }
  const b = await req.json().catch(() => ({})) as Record<string, unknown>

  if (b.op === 'ligar') {
    const tabela = b.tipo === 'cadencia' ? 'cadencias' : 'automacoes'
    const { data, error } = await supabase.from(tabela).update({ ativo: !!b.ativo } as never)
      .eq('id', Number(b.id)).eq('empresa_id', empresaId).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (nadaGravado(data)) return NextResponse.json({ error: 'Nada foi gravado.' }, { status: 403 })
    return NextResponse.json({ ok: true })
  }

  if (b.op === 'pausar') {
    const { data, error } = await supabase.from('configuracoes_sistema')
      .upsert({ empresa_id: empresaId, chave: CHAVE_PAUSA, valor: { pausado: !!b.pausado, por: user.id, em: new Date().toISOString() } } as never, { onConflict: 'empresa_id,chave' })
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (nadaGravado(data)) return NextResponse.json({ error: 'Nada foi gravado.' }, { status: 403 })
    return NextResponse.json({ ok: true, pausado: !!b.pausado })
  }

  if (b.op === 'criar') {
    const acao = String(b.acao) as Acao
    if (!ACOES.includes(acao)) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
    const etapaSlug = String(b.etapa_slug ?? '')
    const { data: etapa } = await supabase.from('funil_etapas').select('id, slug').eq('empresa_id', empresaId).eq('slug', etapaSlug).maybeSingle()
    if (!etapa) return NextResponse.json({ error: 'Etapa não encontrada.' }, { status: 400 })
    const espera = Math.max(0, Math.min(90, Math.floor(Number(b.espera_dias) || 0)))
    const config: Record<string, unknown> = {}
    let modeloId: number | null = null
    if (acao === 'criar_tarefa' || acao === 'notificar_gestor') {
      const titulo = String(b.titulo ?? '').trim()
      if (!titulo) return NextResponse.json({ error: 'Escreva o título da tarefa.' }, { status: 400 })
      config.titulo = titulo.slice(0, 200)
      if (acao === 'criar_tarefa') config.prazo_dias = Math.max(0, Math.min(30, Math.floor(Number(b.prazo_dias) || 0)))
    }
    if (acao === 'atribuir_responsavel') {
      const resp = String(b.responsavel_id ?? '')
      const { data: membro } = await supabase.from('empresa_usuarios').select('usuario_id').eq('empresa_id', empresaId).eq('usuario_id', resp).eq('ativo', true).maybeSingle()
      if (!membro) return NextResponse.json({ error: 'Escolha alguém da equipe.' }, { status: 400 })
      config.responsavel_id = resp
    }
    if (acao === 'enviar_modelo') {
      modeloId = Number(b.modelo_id) || null
      const { data: m } = await supabase.from('modelos_mensagem').select('id, status').eq('empresa_id', empresaId).eq('id', modeloId ?? 0).maybeSingle()
      if (!m || (m as { status: string }).status !== 'aprovado') return NextResponse.json({ error: 'Só modelo aprovado pela Meta.' }, { status: 400 })
      config.parametros = Array.isArray(b.parametros) ? (b.parametros as unknown[]).map(String).slice(0, 10) : []
    }
    const { data, error } = await supabase.from('automacoes').insert({
      empresa_id: empresaId, etapa_slug: etapa.slug, etapa_id: etapa.id, gatilho: 'entrou_na_etapa', acao, config,
      espera_dias: espera, modelo_id: modeloId, ativo: true,
    } as never).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (nadaGravado(data)) return NextResponse.json({ error: 'Nada foi gravado.' }, { status: 403 })
    return NextResponse.json({ ok: true, id: (data as { id: number }[])[0].id })
  }

  return NextResponse.json({ error: 'Operação desconhecida.' }, { status: 400 })
}
