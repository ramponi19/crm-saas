import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { posvendaLigado, semTipo } from '@/lib/posvenda/ligado'
import { nadaGravado } from '@/lib/linhas-afetadas'
import { categoriasPermitidas, ehParametro, PARAMETROS, validarPasso, validarRegua, ROTULO_CATEGORIA } from '@/lib/posvenda/config'

/**
 * CONFIGURAÇÕES › PÓS-VENDA: GRAVAÇÕES (C7 bloco 3, 24/11/2026). Só dono ou administrador (RLS da C1 nas tabelas de
 * configuração; config_salvar nos parâmetros). Nada é apagado: régua, passo e categoria saem de uso com `ativo = false`.
 * Mudar a régua vale para as vendas NOVAS: os passos já agendados mantêm a data.
 *
 * POST { acao: 'regua', id?, nome, ativo, prioridade, categorias[], condicao, ao_recomprar }
 *      { acao: 'passo', id?, cadencia_id, ordem, dia_offset, tipo_acao, titulo, roteiro, grupo, ativo, responsavel,
 *        modelo_id, condicao, tolerancia_dias }   modelo: aprovado, da empresa, de categoria liberada (D8 revista)
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
    const { condicao, ...resto } = r.v
    const linha = { ...resto, filtros: condicao ? { condicao } : {} }
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
