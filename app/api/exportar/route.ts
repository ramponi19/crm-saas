import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'
import { NextResponse } from 'next/server'
import { consultaClientes, clienteDoContato } from '@/lib/clientes'
import type { SupabaseClient } from '@supabase/supabase-js'
import { COLUNAS_LEAD, conversasDosLeads, leadDoNegocio } from '@/lib/leads'

/**
 * `cliente`: o conjunto sai da camada de clientes (lib/clientes.ts) — `contatos` com a
 * marca `_cliente`, na forma de sempre (cidade, tipo de negócio...). O corretor do
 * cliente é campo do módulo Imóveis, em `dados`.
 *
 * `lead`: o negócio na forma de lead (lib/leads.ts; a view `leads` caiu em 05/11/2026):
 * nome e telefone do contato, etapa, e a última mensagem da conversa quando pedida.
 */
const TABELAS: Record<string, { tabela: string; colunas: string; data?: string; corretor?: string; cliente?: true; lead?: true }> = {
  leads: { tabela: 'negocios', lead: true, colunas: 'nome, telefone, instagram, origem, kanban_status, produto_interessado, created_at' },
  clientes: { tabela: 'contatos', cliente: true, colunas: 'nome, telefone, email, cpf_cnpj, created_at' },
  vendas: { tabela: 'vendas_vendas', colunas: 'valor_venda, forma_pagamento, parcelas, status, data_venda, created_at' },

  /**
   * Conjuntos do relatório imobiliário — os mesmos seis que a tela oferece.
   *
   * `data` diz qual coluna o recorte de período usa (cada tabela tem a sua), e
   * `corretor` qual coluna responde pelo filtro de corretor. Sem declarar isso por
   * conjunto, o filtro da tela e o do arquivo divergiriam e a planilha não bateria
   * com o que o dono acabou de ver.
   */
  imob_geral:      { tabela: 'negocios', lead: true, data: 'created_at', corretor: 'responsavel_id',
                     colunas: 'nome, telefone, origem, kanban_status, valor_estimado, responsavel_id, created_at' },
  imob_clientes:   { tabela: 'contatos', cliente: true, data: 'created_at', corretor: 'dados->>corretor_id',
                     colunas: 'nome, cpf_cnpj, telefone, email, tipo_negocio, status_aprovacao, valor_pretendido, regiao_interesse, corretor_id, created_at' },
  imob_imoveis:    { tabela: 'imoveis_imoveis', data: 'created_at',
                     colunas: 'codigo, titulo, tipo, finalidade, status, bairro, cidade, valor_venda, valor_locacao, quartos, vagas, area_util, captado_por, captado_em, created_at' },
  imob_pipeline:   { tabela: 'negocios', lead: true, data: 'created_at', corretor: 'responsavel_id',
                     colunas: 'nome, kanban_status, origem, valor_estimado, ultima_tratativa, ultima_mensagem_at, responsavel_id, created_at' },
  imob_financeiro: { tabela: 'imoveis_negocios', data: 'created_at', corretor: 'corretor_id',
                     colunas: 'origem, cliente_nome, imovel_codigo, tipo, valor, percentual, comissao_total, comissao_captador, comissao_vendedor, cashback, cashback_percentual, comissao_status, comissao_aprovada_em, comissao_paga_em, status, assinado_em, corretor_id, captador_id, created_at' },
  imob_corretores: { tabela: 'visitas', data: 'data_hora', corretor: 'corretor_id',
                     colunas: 'titulo, tipo, status, data_hora, corretor_id, lead_id, imovel_id, created_at' },
}

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: Request) {
  const tipo = new URL(req.url).searchParams.get('tipo') ?? ''
  const cfg = TABELAS[tipo]
  if (!cfg) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })

  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Permissão de exportar: papel do usuário nesta empresa + matriz da empresa.
  const [{ data: vinculo }, { data: empresa }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('usuario_id', user.id).eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('empresas').select('permissoes').eq('id', empresaId).single(),
  ])
  const perms = permsDoPapel(vinculo?.role ?? null, (empresa?.permissoes ?? null) as PermissoesMap | null)
  if (!perms.exportar) {
    return NextResponse.json({ error: 'Seu perfil não tem permissão para exportar dados.' }, { status: 403 })
  }

  // Tabela dinâmica: o client tipado não aceita nome de tabela em string; cast
  // para o client genérico (a permissão e o escopo por empresa já foram validados).
  const db = supabase as unknown as SupabaseClient
  let q = (cfg.cliente ? consultaClientes(db) : db.from(cfg.tabela).select(cfg.lead ? COLUNAS_LEAD : cfg.colunas)).eq('empresa_id', empresaId)

  /**
   * O recorte vem da MESMA querystring da tela (`de`, `ate`, `corretor`).
   *
   * `ate` é inclusivo para quem lê: quem escolhe 31/08 espera o dia 31 dentro. Por
   * isso o filtro usa o dia seguinte como limite exclusivo.
   */
  const url = new URL(req.url)
  const de = url.searchParams.get('de') ?? ''
  const ate = url.searchParams.get('ate') ?? ''
  const corretor = url.searchParams.get('corretor') ?? ''
  const soData = /^\d{4}-\d{2}-\d{2}$/

  if (cfg.data && soData.test(de)) q = q.gte(cfg.data, de)
  if (cfg.data && soData.test(ate)) {
    const [a, m, d] = ate.split('-').map(Number)
    const seguinte = new Date(a, m - 1, d + 1)
    q = q.lt(cfg.data, `${seguinte.getFullYear()}-${String(seguinte.getMonth() + 1).padStart(2, '0')}-${String(seguinte.getDate()).padStart(2, '0')}`)
  }
  if (cfg.corretor && corretor) q = q.eq(cfg.corretor, corretor)

  const { data: rows, error } = await q.order(cfg.data ?? 'created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const brutas = (rows ?? []) as unknown as Record<string, unknown>[]
  const colunas = cfg.colunas.split(',').map(c => c.trim())
  let lista: Record<string, unknown>[] = cfg.cliente ? brutas.map((r) => ({ ...clienteDoContato(r) })) : brutas
  if (cfg.lead) {
    const leads = brutas.map(leadDoNegocio)
    const conv = colunas.includes('ultima_mensagem_at') ? await conversasDosLeads(db, empresaId ?? 0, leads) : null
    lista = leads.map((l) => ({ ...l, ...(conv?.get(l.id) ?? {}) }))
  }
  const header = colunas.join(';')
  const linhas = lista.map(r => colunas.map(c => csvEscape(r[c])).join(';'))
  // BOM p/ Excel reconhecer UTF-8 (acentos).
  const csv = '﻿' + [header, ...linhas].join('\n')

  const hoje = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${tipo}-${hoje}.csv"`,
    },
  })
}
