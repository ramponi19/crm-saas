import { notFound } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { posvendaLigado, semTipo } from '@/lib/posvenda/ligado'
import { ConfigPosVenda, type DadosConfigPosVenda } from '@/components/modules/configuracoes/config-pos-venda'

export const metadata = { title: 'Pós-venda' }

/**
 * CONFIGURAÇÕES › PÓS-VENDA (C7 bloco 3, 24/11/2026). Só dono/admin (layout do grupo) e só com o módulo ligado
 * (linha de empresa_modulos, como a fila). Réguas e passos (roteiro para a janela aberta, modelo para a fechada),
 * parâmetros (categorias de modelo, teto, prazo dos chamados, nota que abre chamado, responsável padrão por loja) e
 * os chamados (categorias e prazos por prioridade).
 */
export default async function Page() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const service = createServiceClient()
  if (!empresaId || !(await posvendaLigado(service, empresaId))) notFound()
  const s = semTipo(supabase)

  const [reguas, passos, modelos, categorias, config, lojas, equipe, catChamado, sla, proprias, campos] = await Promise.all([
    s.from('posvenda_cadencias').select('id, nome, ativo, prioridade, filtros, ao_recomprar').eq('empresa_id', empresaId).order('prioridade', { ascending: false }).order('id'),
    s.from('posvenda_cadencia_passos').select('id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, roteiro, grupo, ativo, responsavel, modelo_id, filtros, tolerancia_dias, ancora_tipo, ancora_mes_dia, ancora_campo, uso_alvo, uso_ritmo_campo, uso_ritmo_padrao, repetir_intervalo, repetir_unidade, repetir_max')
      .eq('empresa_id', empresaId).order('ordem'),
    s.from('modelos_mensagem').select('id, nome, categoria, corpo, status').eq('empresa_id', empresaId).order('nome'),
    s.from('estoque_categorias').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    semTipo(service).from('configuracoes_sistema').select('chave, valor').eq('empresa_id', empresaId).or('chave.like.posvenda.%,chave.eq.core.sem_ofertas,chave.eq.core.condicao_venda'),
    service.from('filiais').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('id'),
    service.from('empresa_usuarios').select('usuario_id, usuarios(nome)').eq('empresa_id', empresaId).eq('ativo', true).eq('conta_servico', false),
    s.from('posvenda_chamado_categorias').select('id, nome, ativo').eq('empresa_id', empresaId).order('id'),
    s.from('posvenda_chamado_sla').select('prioridade, primeira_resposta_horas, resolucao_horas').eq('empresa_id', empresaId).is('categoria_id', null),
    s.from('posvenda_categorias_venda').select('id, nome, ativo, ordem').eq('empresa_id', empresaId).order('ordem').order('nome'),
    s.from('campos_personalizados').select('id, entidade, chave, rotulo, tipo, opcoes, modulo_dono, obrigatorio_na_venda, ativo')
      .eq('empresa_id', empresaId).in('entidade', ['negocio', 'contato']).order('ordem').order('id'),
  ])

  const parametros: DadosConfigPosVenda['parametros'] = {}
  for (const c of (config.data ?? []) as { chave: string; valor: { empresa?: unknown; lojas?: Record<string, unknown> } | null }[]) {
    parametros[c.chave.replace(/^posvenda\./, '')] = { empresa: c.valor?.empresa ?? null, lojas: c.valor?.lojas ?? {} }
  }
  type Membro = { usuario_id: string; usuarios: { nome: string | null } | { nome: string | null }[] | null }
  const categoriasProprias = (proprias.data ?? []) as DadosConfigPosVenda['categoriasProprias']
  // A régua escolhe entre as categorias que o modal de venda oferece (Estoque ou próprias: posvenda.categorias_fonte).
  const fonte = parametros.categorias_fonte?.empresa === 'proprias' ? 'proprias' : 'estoque'
  const dados: DadosConfigPosVenda = {
    reguas: (reguas.data ?? []) as DadosConfigPosVenda['reguas'],
    passos: (passos.data ?? []) as DadosConfigPosVenda['passos'],
    modelos: (modelos.data ?? []) as DadosConfigPosVenda['modelos'],
    categorias: fonte === 'proprias' ? categoriasProprias.filter((c) => c.ativo).map(({ id, nome }) => ({ id, nome }))
      : (categorias.data ?? []) as DadosConfigPosVenda['categorias'],
    fonteCategorias: fonte,
    temEstoque: ((categorias.data ?? []) as unknown[]).length > 0,
    categoriasProprias,
    campos: (campos.data ?? []) as DadosConfigPosVenda['campos'],
    parametros,
    lojas: (lojas.data ?? []) as DadosConfigPosVenda['lojas'],
    equipe: ((equipe.data ?? []) as unknown as Membro[]).map((m) => ({
      id: m.usuario_id, nome: (Array.isArray(m.usuarios) ? m.usuarios[0]?.nome : m.usuarios?.nome) ?? 'Sem nome',
    })).sort((a, b) => a.nome.localeCompare(b.nome)),
    categoriasChamado: (catChamado.data ?? []) as DadosConfigPosVenda['categoriasChamado'],
    sla: (sla.data ?? []) as DadosConfigPosVenda['sla'],
  }
  return <ConfigPosVenda dados={dados} />
}
