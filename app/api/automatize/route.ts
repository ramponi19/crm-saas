import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { agora, inicioDoDia } from '@/lib/datas'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { nadaGravado } from '@/lib/linhas-afetadas'
import { CHAVE_PAUSA } from '@/lib/automacoes'
import { createServiceClient } from '@/lib/supabase/service'
import { aprovadosPorLoja } from '@/lib/canais/modelos-waba'
import { avisosDePagamento } from '@/lib/canais/saude-whatsapp'
import { moduloEstaLigado } from '@/lib/modulo-ligado'
import { recalcularPublico } from '@/lib/publicos/rodada'

/**
 * MODELO POR NÚMERO (11/11/2026): a automação é da empresa, mas o envio sai pelo WhatsApp da loja
 * do negócio. Oferece só modelo aprovado no número de pelo menos uma loja, dizendo em quais está
 * (e em quais falta); o motor pula, com o motivo, o negócio de loja onde ele não está aprovado.
 */
async function modelosPorLoja(empresaId: number) {
  const svc = createServiceClient()
  const [porLoja, { data: filiais }] = await Promise.all([
    aprovadosPorLoja(svc, empresaId),
    svc.from('filiais').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
  ])
  const lojas = (filiais ?? []) as { id: number; nome: string }[]
  return (modeloId: number) => {
    if (!lojas.length) return { lojas: porLoja.get('null')?.has(modeloId) ? ['Empresa'] : [], faltam: [] as string[] }
    const em = lojas.filter((l) => porLoja.get(String(l.id))?.has(modeloId))
    return { lojas: em.map((l) => l.nome), faltam: lojas.filter((l) => !em.includes(l)).map((l) => l.nome) }
  }
}

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

/**
 * "Entrou no público" (12/11/2026): ligar o PRIMEIRO gatilho de um público reconta sem disparar —
 * quem já estava lá não "entra" (a última conta pode ser de dias atrás, e a rodada de hora em hora
 * só recontava os públicos com gatilho). Com outro gatilho já ligado, a conta está em dia.
 */
async function pontoDePartida(supabase: Awaited<ReturnType<typeof createClient>>, empresaId: number, publicoId: number, automacaoId: number) {
  const { count } = await supabase.from('automacoes').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('gatilho', 'entrou_no_publico').eq('publico_id', publicoId).eq('ativo', true).neq('id', automacaoId)
  if (!count) await recalcularPublico(createServiceClient(), publicoId, false)
}
type Acao = typeof ACOES[number]


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
  // 00:00 de hoje no fuso DA LOJA (antes: deslocamento fixo de −3h).
  const hoje = inicioDoDia(agora(), await fusoDaEmpresa(supabase, empresaId)).toISOString()

  let qEtapas = supabase.from('funil_etapas').select('id, slug, label, ordem').eq('empresa_id', empresaId).eq('ativo', true).order('ordem')
  if (funilId) qEtapas = qEtapas.eq('funil_id', funilId)
  const [{ data: etapas }, { data: autos }, { data: cads }, { data: pausa }, { data: modelos }, { data: equipe }] = await Promise.all([
    qEtapas,
    supabase.from('automacoes').select('id, etapa_slug, etapa_id, etiqueta_id, publico_id, gatilho, acao, ativo, espera_dias, modelo_id, config')
      .eq('empresa_id', empresaId).in('gatilho', ['entrou_na_etapa', 'recebeu_etiqueta', 'entrou_no_publico']).order('id'),
    supabase.from('cadencias').select('id, nome, ativo, gatilho_etapa_slug').eq('empresa_id', empresaId).order('id'),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', CHAVE_PAUSA).maybeSingle(),
    supabase.from('modelos_mensagem').select('id, nome, idioma, status, corpo').eq('empresa_id', empresaId).order('nome'),
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
    id: e.id as number,
    slug: e.slug as string,
    label: e.label as string,
    automacoes: (autos ?? []).filter((a) => a.gatilho === 'entrou_na_etapa' && (a.etapa_id != null ? a.etapa_id === e.id : a.etapa_slug === e.slug)).map((a) => ({
      id: a.id, acao: a.acao, ativo: a.ativo, espera_dias: a.espera_dias ?? 0, modelo_id: a.modelo_id, config: a.config,
      na_fila: nFila.get(a.id as number) ?? 0, executadas_hoje: nHoje.get(a.id as number) ?? 0,
    })),
    cadencias: (cads ?? []).filter((c) => c.gatilho_etapa_slug === e.slug).map((c) => ({
      id: c.id, nome: c.nome, ativo: c.ativo, inscritos: nInsc.get(c.id as number) ?? 0, executadas_hoje: nCadHoje.get(c.id as number) ?? 0,
    })),
  }))

  // "Recebeu etiqueta" (11/11/2026): não são de etapa; vêm numa lista à parte, com a etiqueta.
  const porEtiqueta = (autos ?? []).filter((a) => a.gatilho === 'recebeu_etiqueta').map((a) => ({
    id: a.id, etiqueta_id: a.etiqueta_id as number, acao: a.acao, ativo: a.ativo, espera_dias: a.espera_dias ?? 0,
    modelo_id: a.modelo_id, config: a.config,
    na_fila: nFila.get(a.id as number) ?? 0, executadas_hoje: nHoje.get(a.id as number) ?? 0,
  }))

  // "Entrou no público" (12/11/2026): só com o módulo Públicos ligado (null = a tela nem mostra).
  let porPublico = null
  let publicos = null
  if (await moduloEstaLigado(empresaId, 'publicos')) {
    const { data: pubs } = await supabase.from('publicos').select('id, nome, filial_id, total').eq('empresa_id', empresaId).order('nome')
    publicos = pubs ?? []
    porPublico = (autos ?? []).filter((a) => a.gatilho === 'entrou_no_publico').map((a) => ({
      id: a.id, publico_id: a.publico_id as number, acao: a.acao, ativo: a.ativo, espera_dias: a.espera_dias ?? 0,
      modelo_id: a.modelo_id, config: a.config,
      na_fila: nFila.get(a.id as number) ?? 0, executadas_hoje: nHoje.get(a.id as number) ?? 0,
    }))
  }

  return NextResponse.json({
    podeEditar: role === 'owner' || role === 'admin',
    porPublico,
    publicos,
    pausado: !!(pausa?.valor as { pausado?: boolean } | null)?.pausado,
    etapas: porEtapa,
    porEtiqueta,
    modelos: await (async () => {
      const onde = await modelosPorLoja(empresaId)
      return (modelos ?? []).map((m) => ({ ...m, ...onde(m.id as number) })).filter((m) => m.lojas.length > 0)
    })(),
    equipe: ((equipe ?? []) as unknown as { usuario_id: string; usuarios: { nome: string | null } | null }[])
      .map((u) => ({ id: u.usuario_id, nome: u.usuarios?.nome ?? '—' })),
    // Conta da Meta sem forma de pagamento, por loja (11/11/2026): o "enviar modelo" falha lá.
    avisosPagamento: await avisosDePagamento(createServiceClient(), empresaId).catch((e) => { console.error('avisosDePagamento:', e); return [] }),
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
    // Ligar um "entrou no público" exige o módulo ligado e recebe o ponto de partida.
    let publicoId: number | null = null
    if (tabela === 'automacoes' && b.ativo) {
      const { data: a } = await supabase.from('automacoes').select('gatilho, publico_id, ativo').eq('id', Number(b.id)).eq('empresa_id', empresaId).maybeSingle()
      if (a?.gatilho === 'entrou_no_publico' && !a.ativo) {
        if (!(await moduloEstaLigado(empresaId, 'publicos'))) return NextResponse.json({ error: 'O módulo Públicos não está instalado nesta empresa.' }, { status: 403 })
        publicoId = a.publico_id as number
      }
    }
    const { data, error } = await supabase.from(tabela).update({ ativo: !!b.ativo } as never)
      .eq('id', Number(b.id)).eq('empresa_id', empresaId).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (nadaGravado(data)) return NextResponse.json({ error: 'Nada foi gravado.' }, { status: 403 })
    if (publicoId) await pontoDePartida(supabase, empresaId, publicoId, Number(b.id))
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
    // Gatilho: "entrou na etapa" (padrão), "recebeu etiqueta" (11/11/2026) ou "entrou no público"
    // (12/11/2026, só com o módulo Públicos ligado).
    const porEtiqueta = b.gatilho === 'recebeu_etiqueta'
    const porPublico = b.gatilho === 'entrou_no_publico'
    let etapa: { id: number; slug: string } | null = null
    let etiquetaId: number | null = null
    let publicoId: number | null = null
    if (porPublico) {
      if (!(await moduloEstaLigado(empresaId, 'publicos'))) return NextResponse.json({ error: 'O módulo Públicos não está instalado nesta empresa.' }, { status: 403 })
      publicoId = Number(b.publico_id) || null
      const { data: pub } = await supabase.from('publicos').select('id').eq('empresa_id', empresaId).eq('id', publicoId ?? 0).maybeSingle()
      if (!pub) return NextResponse.json({ error: 'Escolha o público.' }, { status: 400 })
    } else if (porEtiqueta) {
      etiquetaId = Number(b.etiqueta_id) || null
      const { data: etq } = await supabase.from('etiquetas').select('id').eq('empresa_id', empresaId).eq('id', etiquetaId ?? 0).maybeSingle()
      if (!etq) return NextResponse.json({ error: 'Escolha a etiqueta.' }, { status: 400 })
    } else {
      // Pelo id da etapa (o slug só é único dentro de um funil); o slug fica de reserva.
      const etapaId = Number(b.etapa_id) || null
      const etapaSlug = String(b.etapa_slug ?? '')
      const { data } = etapaId
        ? await supabase.from('funil_etapas').select('id, slug').eq('empresa_id', empresaId).eq('id', etapaId).maybeSingle()
        : await supabase.from('funil_etapas').select('id, slug').eq('empresa_id', empresaId).eq('slug', etapaSlug).maybeSingle()
      etapa = data as { id: number; slug: string } | null
      if (!etapa) return NextResponse.json({ error: 'Etapa não encontrada.' }, { status: 400 })
    }
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
      const { data: m } = await supabase.from('modelos_mensagem').select('id').eq('empresa_id', empresaId).eq('id', modeloId ?? 0).maybeSingle()
      if (!m || !(await modelosPorLoja(empresaId))(modeloId as number).lojas.length) {
        return NextResponse.json({ error: 'Só modelo aprovado pela Meta no WhatsApp de pelo menos uma loja.' }, { status: 400 })
      }
      config.parametros = Array.isArray(b.parametros) ? (b.parametros as unknown[]).map(String).slice(0, 10) : []
    }
    const { data, error } = await supabase.from('automacoes').insert({
      empresa_id: empresaId, etapa_slug: etapa?.slug ?? null, etapa_id: etapa?.id ?? null, etiqueta_id: etiquetaId,
      publico_id: publicoId,
      gatilho: porPublico ? 'entrou_no_publico' : porEtiqueta ? 'recebeu_etiqueta' : 'entrou_na_etapa', acao, config,
      espera_dias: espera, modelo_id: modeloId, ativo: true,
    } as never).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (nadaGravado(data)) return NextResponse.json({ error: 'Nada foi gravado.' }, { status: 403 })
    const novoId = (data as { id: number }[])[0].id
    if (publicoId) await pontoDePartida(supabase, empresaId, publicoId, novoId)
    return NextResponse.json({ ok: true, id: novoId })
  }

  return NextResponse.json({ error: 'Operação desconhecida.' }, { status: 400 })
}
