import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { posvendaLigado, semTipo } from '@/lib/posvenda/ligado'
import { nadaGravado } from '@/lib/linhas-afetadas'
import { categoriasPermitidas, ehParametro, filtrosDoPasso, PARAMETROS, validarCampoVenda, validarPasso, validarRegua, ROTULO_CATEGORIA } from '@/lib/posvenda/config'

/**
 * CONFIGURAÇÕES › PÓS-VENDA: GRAVAÇÕES (C7 bloco 3, 24/11/2026). Só dono ou administrador (RLS da C1 nas tabelas de
 * configuração; config_salvar nos parâmetros). Nada é apagado: régua, passo e categoria saem de uso com `ativo = false`.
 * Mudar a régua vale para as vendas NOVAS: os passos já agendados mantêm a data.
 *
 * POST { acao: 'regua', id?, nome, ativo, prioridade, categorias[], condicao, ao_recomprar }
 *      { acao: 'passo', id?, cadencia_id, ordem, dia_offset, tipo_acao, titulo, roteiro, grupo, ativo, responsavel,
 *        modelo_id, condicao, tolerancia_dias, ancora_tipo, ancora_mes_dia, ancora_campo, uso_alvo, uso_ritmo_campo,
 *        uso_ritmo_padrao, repetir, repetir_intervalo, repetir_unidade, repetir_max, campos[] }
 *        modelo: aprovado, da empresa, de categoria liberada (D8 revista); campo da âncora e dos filtros: cadastrado
 *      { acao: 'categoria_venda', id?, nome, ativo, ordem? }   categorias próprias (posvenda.categorias_fonte = proprias)
 *      { acao: 'campo_venda', id?, rotulo, tipo, opcoes[], obrigatorio, ativo }   campo de negócio do Pós-venda
 *      { acao: 'parametro', chave, valor, filialId? }   valor null na loja = volta ao da empresa
 *      { acao: 'categoria_chamado', id?, nome, ativo }
 *      { acao: 'sla', prioridade, primeira_resposta_horas, resolucao_horas }
 */
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
/** Insert barrado pela RLS (vendedor) vem como erro 42501, não como 0 linhas. */
const barradoPelaRls = (e: { code?: string; message: string }) => e.code === '42501' || /row-level security/i.test(e.message)

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return erro('Não autenticado', 401)
  const empresaId = await getEmpresaId()
  if (!empresaId) return erro('Sem empresa')
  const service = createServiceClient()
  if (!(await posvendaLigado(service, empresaId))) {
    return NextResponse.json({ error: 'O Pós-venda não está ligado nesta empresa.', code: 'modulo_desligado', modulo: 'posvenda' }, { status: 403 })
  }
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const s = semTipo(supabase)
  const semPermissao = () => erro('Só o dono ou um administrador altera o pós-venda.', 403)
  const id = b.id == null ? null : Number(b.id)

  if (b.acao === 'regua') {
    const r = validarRegua(b)
    if (!r.ok) return erro(r.erro, 422)
    const filtros: Record<string, unknown> = {}
    if (r.v.categorias.length) filtros.categorias = r.v.categorias
    if (r.v.condicao) filtros.condicao = r.v.condicao
    const linha = { nome: r.v.nome, ativo: r.v.ativo, prioridade: r.v.prioridade, filtros, ao_recomprar: r.v.ao_recomprar }
    const { data, error } = id
      ? await s.from('posvenda_cadencias').update(linha).eq('id', id).eq('empresa_id', empresaId).select('id')
      : await s.from('posvenda_cadencias').insert({ ...linha, empresa_id: empresaId, criado_por: user.id }).select('id')
    if (error) return barradoPelaRls(error) ? semPermissao() : erro(error.message, 500)
    if (nadaGravado(data)) return semPermissao()
    return NextResponse.json({ ok: true, id: (data as { id: number }[])[0].id })
  }

  if (b.acao === 'passo') {
    const r = validarPasso(b)
    if (!r.ok) return erro(r.erro, 422)
    const cadencia = Number(b.cadencia_id)
    const { data: cad } = await s.from('posvenda_cadencias').select('id').eq('id', cadencia).eq('empresa_id', empresaId).maybeSingle()
    if (!cad) return erro('Régua não encontrada.', 404)
    if (r.v.responsavel.startsWith('usuario:')) {
      const { data: pessoa } = await service.from('empresa_usuarios').select('usuario_id').eq('empresa_id', empresaId)
        .eq('usuario_id', r.v.responsavel.slice(8)).eq('ativo', true).eq('conta_servico', false).maybeSingle()
      if (!pessoa) return erro('Escolha uma pessoa ativa da equipe.', 422)
    }
    if (r.v.modelo_id != null) {
      const [{ data: m }, { data: cfg }] = await Promise.all([
        s.from('modelos_mensagem').select('id, nome, categoria, status').eq('id', r.v.modelo_id).eq('empresa_id', empresaId).maybeSingle(),
        semTipo(service).rpc('config_valor_emp', { p_empresa: empresaId, p_modulo: 'posvenda', p_chave: 'categorias_modelo' }),
      ])
      const modelo = m as { categoria: string; status: string } | null
      if (!modelo) return erro('Modelo não encontrado.', 404)
      if (modelo.status !== 'aprovado') return erro('Escolha um modelo já aprovado pela Meta.', 422)
      const ok = categoriasPermitidas(cfg)
      if (!(ok as string[]).includes(modelo.categoria)) {
        return erro(`O pós-venda desta empresa só usa modelos de ${ok.map((c) => ROTULO_CATEGORIA[c]).join(' e ')}. Libere ${ROTULO_CATEGORIA[modelo.categoria] ?? modelo.categoria} nos parâmetros.`, 422)
      }
    }
    // Os campos que o passo usa (âncora, ritmo, filtros) precisam existir na empresa (negócio ou cliente).
    const usados = [...new Set([r.v.ancora_campo, r.v.uso_ritmo_campo, ...r.v.campos.map((c) => c.chave)].filter((c): c is string => !!c))]
    if (usados.length) {
      const { data: existem } = await s.from('campos_personalizados').select('chave').eq('empresa_id', empresaId).eq('ativo', true)
        .in('entidade', ['negocio', 'contato']).in('chave', usados)
      const achou = new Set(((existem ?? []) as { chave: string }[]).map((c) => c.chave))
      const falta = usados.filter((c) => !achou.has(c))
      if (falta.length) return erro(`Campo não cadastrado: ${falta.join(', ')}. Crie em Pós-venda › Venda.`, 422)
    }
    const { condicao, campos, ...resto } = r.v
    const linha = { ...resto, filtros: filtrosDoPasso({ condicao, campos }) }
    const { data, error } = id
      ? await s.from('posvenda_cadencia_passos').update(linha).eq('id', id).eq('empresa_id', empresaId).eq('cadencia_id', cadencia).select('id')
      : await s.from('posvenda_cadencia_passos').insert({ ...linha, empresa_id: empresaId, cadencia_id: cadencia }).select('id')
    if (error && barradoPelaRls(error)) return semPermissao()
    if (error) return erro(/unique|duplicate/i.test(error.message) ? 'Já existe um passo com essa ordem nesta régua.' : error.message, /unique|duplicate/i.test(error.message) ? 409 : 500)
    if (nadaGravado(data)) return semPermissao()
    return NextResponse.json({ ok: true, id: (data as { id: number }[])[0].id })
  }

  if (b.acao === 'parametro') {
    if (!ehParametro(b.chave)) return erro('Parâmetro desconhecido.')
    const def = PARAMETROS[b.chave]
    const filialId = typeof b.filialId === 'number' ? b.filialId : null
    if (filialId != null && !def.porLoja) return erro('Este parâmetro vale para a empresa toda.')
    let valor: unknown = null
    if (!(filialId != null && b.valor === null)) {
      valor = def.validar(b.valor)
      if (valor === undefined) return erro('Valor inválido.', 422)
    }
    if (b.chave === 'responsavel_padrao' && valor) {
      const { data: p } = await service.from('empresa_usuarios').select('usuario_id').eq('empresa_id', empresaId).eq('usuario_id', valor as string)
        .eq('ativo', true).eq('conta_servico', false).maybeSingle()
      if (!p) return erro('Escolha uma pessoa ativa da equipe.', 422)
    }
    const { data, error } = await supabase.rpc('config_salvar', { p_modulo: 'posvenda', p_chave: b.chave, p_valor: valor, p_filial: filialId ?? undefined } as never)
    if (error) return /SEM_PERMISSAO|SOMENTE_LEITURA/.test(error.message) ? semPermissao() : erro(error.message)
    return NextResponse.json({ ok: true, valor: data })
  }

  // "Não quero receber ofertas" (core.sem_ofertas): os textos dos botões que marcam o cliente e a confirmação que sai.
  if (b.acao === 'sem_ofertas') {
    const botoes = Array.isArray(b.botoes) ? [...new Set(b.botoes.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 60)).filter((x) => x.length >= 3))] : []
    const confirmacao = typeof b.confirmacao === 'string' ? b.confirmacao.trim().slice(0, 600) : ''
    if (botoes.length === 0) return erro('Informe ao menos um texto de botão.', 422)
    if (confirmacao.length < 3) return erro('Escreva a confirmação que o cliente recebe.', 422)
    const { error } = await supabase.rpc('config_salvar', { p_modulo: 'core', p_chave: 'sem_ofertas', p_valor: { botoes, confirmacao } } as never)
    if (error) return /SEM_PERMISSAO|SOMENTE_LEITURA/.test(error.message) ? semPermissao() : erro(error.message)
    return NextResponse.json({ ok: true })
  }

  // Condição na venda (core.condicao_venda): exigida | opcional | nao_usa — vale para o modal de venda de toda a empresa.
  if (b.acao === 'condicao_venda') {
    if (!['exigida', 'opcional', 'nao_usa'].includes(b.valor as string)) return erro('Escolha exigida, opcional ou não usa.', 422)
    const { error } = await supabase.rpc('config_salvar', { p_modulo: 'core', p_chave: 'condicao_venda', p_valor: b.valor } as never)
    if (error) return /SEM_PERMISSAO|SOMENTE_LEITURA/.test(error.message) ? semPermissao() : erro(error.message)
    return NextResponse.json({ ok: true })
  }

  // Categorias próprias da venda (quem não usa o Estoque). Nada é apagado: sai de uso com ativo = false.
  if (b.acao === 'categoria_venda') {
    const nome = typeof b.nome === 'string' ? b.nome.trim().slice(0, 60) : ''
    if (nome.length < 2) return erro('Dê um nome à categoria.', 422)
    const ordem = Number.isInteger(Number(b.ordem)) ? Number(b.ordem) : 0
    const linha = { nome, ativo: b.ativo !== false, ordem }
    const { data, error } = id
      ? await s.from('posvenda_categorias_venda').update(linha).eq('id', id).eq('empresa_id', empresaId).select('id')
      : await s.from('posvenda_categorias_venda').insert({ ...linha, empresa_id: empresaId }).select('id')
    if (error) return barradoPelaRls(error) ? semPermissao() : erro(error.message, 500)
    if (nadaGravado(data)) return semPermissao()
    return NextResponse.json({ ok: true, id: (data as { id: number }[])[0].id })
  }

  // Campos da venda: campos personalizados de negócio do Pós-venda (aparecem no modal de venda com o módulo ligado).
  // A chave e o tipo não mudam depois de criados (os valores já gravados dependem deles).
  if (b.acao === 'campo_venda') {
    const r = validarCampoVenda(b)
    if (!r.ok) return erro(r.erro, 422)
    if (id) {
      const { data, error } = await s.from('campos_personalizados')
        .update({ rotulo: r.v.rotulo, opcoes: r.v.opcoes, obrigatorio_na_venda: r.v.obrigatorio, ativo: r.v.ativo, updated_at: new Date().toISOString() })
        .eq('id', id).eq('empresa_id', empresaId).eq('entidade', 'negocio').eq('modulo_dono', 'posvenda').select('id')
      if (error) return barradoPelaRls(error) ? semPermissao() : erro(error.message, 500)
      if (nadaGravado(data)) return semPermissao()
      return NextResponse.json({ ok: true, id })
    }
    const { data: ultimo } = await s.from('campos_personalizados').select('ordem').eq('empresa_id', empresaId).eq('entidade', 'negocio')
      .order('ordem', { ascending: false }).limit(1)
    const ordem = (((ultimo ?? []) as { ordem: number }[])[0]?.ordem ?? 0) + 1
    const { data, error } = await s.from('campos_personalizados').insert({
      empresa_id: empresaId, entidade: 'negocio', chave: r.v.chave, rotulo: r.v.rotulo, tipo: r.v.tipo, opcoes: r.v.opcoes,
      modulo_dono: 'posvenda', obrigatorio_na_venda: r.v.obrigatorio, ativo: r.v.ativo, ordem,
    }).select('id')
    if (error && barradoPelaRls(error)) return semPermissao()
    if (error) return /unique|duplicate/i.test(error.message) ? erro('Já existe um campo com esse nome na empresa. Use outro nome.', 409) : erro(error.message, 500)
    if (nadaGravado(data)) return semPermissao()
    return NextResponse.json({ ok: true, id: (data as { id: number }[])[0].id })
  }

  if (b.acao === 'categoria_chamado') {
    const nome = typeof b.nome === 'string' ? b.nome.trim().slice(0, 60) : ''
    if (nome.length < 2) return erro('Dê um nome à categoria.', 422)
    const linha = { nome, ativo: b.ativo !== false }
    const { data, error } = id
      ? await s.from('posvenda_chamado_categorias').update(linha).eq('id', id).eq('empresa_id', empresaId).select('id')
      : await s.from('posvenda_chamado_categorias').insert({ ...linha, empresa_id: empresaId }).select('id')
    if (error) return barradoPelaRls(error) ? semPermissao() : erro(error.message, 500)
    if (nadaGravado(data)) return semPermissao()
    return NextResponse.json({ ok: true, id: (data as { id: number }[])[0].id })
  }

  if (b.acao === 'sla') {
    const prioridade = String(b.prioridade ?? '')
    const pr = Number(b.primeira_resposta_horas), rs = Number(b.resolucao_horas)
    if (!['baixa', 'normal', 'alta', 'urgente'].includes(prioridade)) return erro('Prioridade inválida.')
    if (!(Number.isInteger(pr) && pr > 0 && pr <= 720 && Number.isInteger(rs) && rs >= pr && rs <= 2160)) {
      return erro('Horas inteiras: 1ª resposta de 1 a 720 e resolução maior ou igual a ela (até 2160).', 422)
    }
    const { data: atual } = await s.from('posvenda_chamado_sla').select('id').eq('empresa_id', empresaId).eq('prioridade', prioridade).is('categoria_id', null).maybeSingle()
    const linha = { primeira_resposta_horas: pr, resolucao_horas: rs }
    const { data, error } = atual
      ? await s.from('posvenda_chamado_sla').update(linha).eq('id', (atual as { id: number }).id).select('id')
      : await s.from('posvenda_chamado_sla').insert({ ...linha, empresa_id: empresaId, prioridade, categoria_id: null }).select('id')
    if (error) return barradoPelaRls(error) ? semPermissao() : erro(error.message, 500)
    if (nadaGravado(data)) return semPermissao()
    return NextResponse.json({ ok: true })
  }

  return erro('Ação inválida.')
}
