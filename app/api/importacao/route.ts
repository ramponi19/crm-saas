import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import type { Json as JsonDb } from '@/types/database.gerado'
import { CAMPOS, ETIQUETA_IMPORTACAO, MAX_LINHAS, validarLinhas, type LinhaValida, type Mapa, type Recusada } from '@/lib/importacao'

type Json = Record<string, unknown>
const LOTE = 500

/**
 * IMPORTAÇÃO DE CONTATOS E LEADS (18/11/2026, core). `gravar: false` = prévia (nada gravado); `true` = grava.
 *
 *   - Dedup por telefone: na planilha (lib/importacao.ts) e contra os contatos da EMPRESA (`telefone_e164`,
 *     o índice único) — de outra empresa nunca: a busca é pelo id da empresa da sessão.
 *   - Contato que já existe não é alterado. Com "criar lead", ganha um negócio novo só se não tiver negócio
 *     aberto (senão conta como "já existia" e fica como está).
 *   - Todo contato que a importação cria, ou para o qual cria lead, recebe a etiqueta "importação" (criada
 *     na hora se a empresa não tiver).
 *   - Leads vão para o funil escolhido (ou o padrão), na etapa escolhida (ou a primeira), na loja de
 *     gravação de quem importa; o teto de leads do plano é do banco (LEAD_LIMIT_REACHED vira recusa).
 *   - A importação gravada fica em `importacoes`, com as recusadas.
 * Só dono e admin.
 */
export async function POST(req: Request) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const b = (await req.json().catch(() => null)) as Json | null
  const linhas = b?.linhas
  if (!Array.isArray(linhas) || linhas.length === 0 || !linhas.every((l) => Array.isArray(l) && l.every((c) => typeof c === 'string'))) {
    return NextResponse.json({ error: 'Linhas inválidas' }, { status: 400 })
  }
  if (linhas.length > MAX_LINHAS) return NextResponse.json({ error: `No máximo ${MAX_LINHAS} linhas por importação` }, { status: 400 })
  const mapa: Mapa = {}
  for (const c of CAMPOS) {
    const v = (b?.mapa as Json | undefined)?.[c.chave]
    if (v == null || v === '') continue
    if (!Number.isInteger(v) || (v as number) < 0) return NextResponse.json({ error: `Coluna inválida para ${c.rotulo}` }, { status: 400 })
    mapa[c.chave] = v as number
  }
  if (mapa.telefone == null) return NextResponse.json({ error: 'Escolha a coluna do telefone' }, { status: 400 })
  const criarLead = b?.criarLead !== false
  const gravar = b?.gravar === true
  const arquivo = typeof b?.arquivo === 'string' ? b.arquivo.slice(0, 200) : null
  const svc = createServiceClient()
  const empresaId = auth.empresaId

  // Funil, etapa e responsável: da empresa da sessão.
  let funilId: number | null = null
  let etapa: { id: number; tipo: string | null } | null = null
  if (criarLead) {
    const pedido = Number(b?.funilId) || null
    const { data: funis } = pedido
      ? await svc.from('funis').select('id').eq('empresa_id', empresaId).eq('id', pedido).limit(1)
      : await svc.from('funis').select('id').eq('empresa_id', empresaId).eq('padrao', true).eq('interno', false).order('id').limit(1)
    funilId = (funis?.[0]?.id as number | undefined) ?? null
    if (pedido && !funilId) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 400 })
    if (funilId) {
      const etapaPedida = Number(b?.etapaId) || null
      let q = svc.from('funil_etapas').select('id, tipo').eq('funil_id', funilId)
      q = etapaPedida ? q.eq('id', etapaPedida) : q.order('ordem').order('id')
      const { data } = await q.limit(1)
      etapa = (data?.[0] as { id: number; tipo: string | null } | undefined) ?? null
      if (etapaPedida && !etapa) return NextResponse.json({ error: 'Etapa não é do funil escolhido' }, { status: 400 })
      // Venda fechada exige data, categoria, condição e valor de cada venda (23/11/2026): a planilha
      // não entra direto numa etapa de ganho — importa numa etapa aberta e marca cada venda depois.
      if (etapa?.tipo === 'ganho') {
        return NextResponse.json({ error: 'Não dá para importar direto numa etapa de venda fechada. Escolha uma etapa aberta e marque cada venda com a data e o valor dela.', codigo: 'GANHO_DADOS' }, { status: 400 })
      }
    }
  }
  const responsavelId = typeof b?.responsavelId === 'string' && b.responsavelId ? b.responsavelId : null
  if (responsavelId) {
    const { data: u } = await svc.from('empresa_usuarios').select('usuario_id')
      .eq('empresa_id', empresaId).eq('usuario_id', responsavelId).eq('ativo', true).maybeSingle()
    if (!u) return NextResponse.json({ error: 'Responsável não é da empresa' }, { status: 400 })
  }

  const { validas, recusadas } = validarLinhas(linhas as string[][], mapa)

  // Os que já existem na empresa, e quais deles têm negócio aberto.
  const existentes = new Map<string, { id: number; etiquetas: number[] }>()
  for (let i = 0; i < validas.length; i += 300) {
    const { data, error } = await svc.from('contatos').select('id, telefone_e164, etiqueta_ids')
      .eq('empresa_id', empresaId).in('telefone_e164', validas.slice(i, i + 300).map((v) => v.e164))
    if (error) return NextResponse.json({ error: `ler contatos: ${error.message}` }, { status: 500 })
    for (const c of data ?? []) existentes.set(c.telefone_e164 as string, { id: c.id as number, etiquetas: (c.etiqueta_ids as number[] | null) ?? [] })
  }
  const comAberto = new Set<number>()
  if (criarLead && existentes.size) {
    const ids = [...existentes.values()].map((e) => e.id)
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await svc.from('negocios').select('contato_id').eq('empresa_id', empresaId).eq('status', 'aberto')
        .in('contato_id', ids.slice(i, i + 300))
      for (const n of data ?? []) comAberto.add(n.contato_id as number)
    }
  }
  const novos = validas.filter((v) => !existentes.has(v.e164))
  const existentesValidas = validas.filter((v) => existentes.has(v.e164))
  const leadParaExistente = criarLead ? existentesValidas.filter((v) => !comAberto.has(existentes.get(v.e164)!.id)) : []

  if (!gravar) {
    return NextResponse.json({
      total: linhas.length, validas: validas.length, recusadas,
      contatosNovos: novos.length, contatosExistentes: existentesValidas.length,
      leadsACriar: criarLead ? novos.length + leadParaExistente.length : 0,
      semFunil: criarLead && !funilId,
      amostra: validas.slice(0, 8).map((v) => ({ linha: v.linha, nome: v.nome, telefone: v.telefone, email: v.email, interesse: v.interesse, valor: v.valor, existe: existentes.has(v.e164) })),
    })
  }

  // ── Gravar ────────────────────────────────────────────────────────────────
  const { data: filial } = await auth.supabase.rpc('filial_gravacao', { p_empresa: empresaId })
  const filialId = typeof filial === 'number' ? filial : null
  const etiquetaId = await etiquetaDaImportacao(svc, empresaId, auth.userId)
  if (!etiquetaId) return NextResponse.json({ error: 'Não foi possível criar a etiqueta "importação"' }, { status: 500 })

  // O interesse vai para o campo "Produto de interesse" do lead; se a empresa o desligou, vai para as
  // observações do contato (o gatilho recusaria o lead com a chave de um campo inativo).
  const { count: campoInteresse } = await svc.from('campos_personalizados').select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('entidade', 'negocio').eq('chave', 'produto_interessado').eq('ativo', true)
  if (!campoInteresse) {
    for (const v of validas) if (v.interesse) { v.observacoes = [v.observacoes, `Interesse: ${v.interesse}`].filter(Boolean).join(' · '); v.interesse = null }
  }

  // 1) contatos novos, em lotes (corrida no índice único: a linha vira "já existia").
  const contatoDe = new Map<string, number>()
  let contatosNovos = 0
  let corrida = 0
  const linhaContato = (v: LinhaValida) => ({
    empresa_id: empresaId, filial_id: filialId, nome: v.nome, telefone: v.telefone, telefone_e164: v.e164, email: v.email,
    origem: 'importacao', observacoes: v.observacoes, responsavel_id: responsavelId, ativo: true, etiqueta_ids: [etiquetaId],
  })
  for (let i = 0; i < novos.length; i += LOTE) {
    const lote = novos.slice(i, i + LOTE)
    const { data, error } = await svc.from('contatos').insert(lote.map(linhaContato)).select('id, telefone_e164')
    if (!error) {
      for (const c of data ?? []) contatoDe.set(c.telefone_e164 as string, c.id as number)
      contatosNovos += data?.length ?? 0
      continue
    }
    for (const v of lote) {
      const r = await svc.from('contatos').insert(linhaContato(v)).select('id').single()
      if (!r.error) { contatoDe.set(v.e164, r.data.id as number); contatosNovos++; continue }
      if (r.error.code === '23505') {
        const { data: ja } = await svc.from('contatos').select('id').eq('empresa_id', empresaId).eq('telefone_e164', v.e164).maybeSingle()
        if (ja) { existentes.set(v.e164, { id: ja.id as number, etiquetas: [] }); corrida++; continue }
      }
      recusadas.push({ linha: v.linha, motivo: `não gravou o contato (${r.error.message.slice(0, 80)})` })
    }
  }

  // 2) leads: os contatos novos e os existentes sem negócio aberto.
  let leadsCriados = 0
  const leadContatos: { v: LinhaValida; contatoId: number; existente: boolean }[] = []
  if (criarLead) {
    for (const v of novos) { const id = contatoDe.get(v.e164); if (id) leadContatos.push({ v, contatoId: id, existente: false }) }
    for (const v of leadParaExistente) leadContatos.push({ v, contatoId: existentes.get(v.e164)!.id, existente: true })
  }
  const status = etapa?.tipo === 'ganho' ? 'ganho' : etapa?.tipo === 'perdido' ? 'perdido' : 'aberto'
  const agoraIso = new Date().toISOString()
  const linhaNegocio = ({ v, contatoId }: { v: LinhaValida; contatoId: number }) => {
    const lead: Json = { ativo: true, origem: 'importacao' }
    if (responsavelId) lead.responsavel_desde = agoraIso
    if (!etapa) lead.kanban_status = 'novo'
    const dados: Json = { _lead: lead }
    if (v.interesse) dados.produto_interessado = v.interesse
    return {
      empresa_id: empresaId, filial_id: filialId, contato_id: contatoId, funil_id: funilId, etapa_id: etapa?.id ?? null,
      status, responsavel_id: responsavelId, valor_estimado: v.valor, dados: dados as NonNullable<JsonDb>,
      ...(status === 'ganho' ? { ganho_em: agoraIso } : {}), ...(status === 'perdido' ? { perdido_em: agoraIso } : {}),
    }
  }
  const comLead = new Set<number>()
  let limite = false
  for (let i = 0; i < leadContatos.length; i += LOTE) {
    const lote = leadContatos.slice(i, i + LOTE)
    if (!limite) {
      const { data, error } = await svc.from('negocios').insert(lote.map(linhaNegocio)).select('contato_id')
      if (!error) { leadsCriados += data?.length ?? 0; lote.forEach((x) => comLead.add(x.contatoId)); continue }
      if (!error.message.includes('LEAD_LIMIT_REACHED')) {
        lote.forEach((x) => recusadas.push({ linha: x.v.linha, motivo: `não criou o lead (${error.message.slice(0, 80)})` }))
        continue
      }
    }
    // Teto de leads do plano: um por um até bater; o resto é recusado com o motivo.
    for (const x of lote) {
      if (limite) { recusadas.push({ linha: x.v.linha, motivo: 'limite de leads do plano (o contato foi criado sem lead)' }); continue }
      const { error } = await svc.from('negocios').insert(linhaNegocio(x))
      if (!error) { leadsCriados++; comLead.add(x.contatoId); continue }
      if (error.message.includes('LEAD_LIMIT_REACHED')) { limite = true; recusadas.push({ linha: x.v.linha, motivo: 'limite de leads do plano (o contato foi criado sem lead)' }) }
      else recusadas.push({ linha: x.v.linha, motivo: `não criou o lead (${error.message.slice(0, 80)})` })
    }
  }

  // 3) etiqueta nos existentes que ganharam lead (depois do negócio: o histórico vai para ele).
  for (const x of leadContatos.filter((l) => l.existente && comLead.has(l.contatoId))) {
    const atuais = existentes.get(x.v.e164)?.etiquetas ?? []
    if (atuais.includes(etiquetaId)) continue
    await svc.from('contatos').update({ etiqueta_ids: [...atuais, etiquetaId] }).eq('id', x.contatoId).eq('empresa_id', empresaId)
  }

  recusadas.sort((a, b) => a.linha - b.linha)
  const contatosExistentes = existentesValidas.length + corrida
  const { data: reg } = await svc.from('importacoes').insert({
    empresa_id: empresaId, filial_id: filialId, usuario_id: auth.userId, arquivo, total: linhas.length,
    contatos_novos: contatosNovos, contatos_existentes: contatosExistentes, leads_criados: leadsCriados,
    recusadas: recusadas as unknown as NonNullable<JsonDb>,
  }).select('id').single()

  return NextResponse.json({
    ok: true, importacaoId: reg?.id ?? null, total: linhas.length, contatosNovos, contatosExistentes, leadsCriados,
    recusadas: recusadas as Recusada[], etiquetaId,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function etiquetaDaImportacao(svc: any, empresaId: number, usuarioId: string): Promise<number | null> {
  const buscar = async () => {
    const { data } = await svc.from('etiquetas').select('id, nome').eq('empresa_id', empresaId)
    return ((data ?? []) as { id: number; nome: string }[]).find((e) => e.nome.trim().toLowerCase() === ETIQUETA_IMPORTACAO)?.id ?? null
  }
  const ja = await buscar()
  if (ja) return ja
  const { data, error } = await svc.from('etiquetas').insert({ empresa_id: empresaId, nome: ETIQUETA_IMPORTACAO, cor: 'azul', criada_por: usuarioId }).select('id').single()
  if (!error) return data.id as number
  return buscar()
}
