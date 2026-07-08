import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { permsDoPapel, type PermissoesMap } from '@/lib/permissoes'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

const TABELAS: Record<string, { tabela: string; colunas: string }> = {
  leads: { tabela: 'leads', colunas: 'nome, telefone, instagram, origem, kanban_status, produto_interessado, created_at' },
  clientes: { tabela: 'clientes', colunas: 'nome, telefone, email, cpf_cnpj, created_at' },
  vendas: { tabela: 'vendas', colunas: 'valor_venda, forma_pagamento, parcelas, status, data_venda, created_at' },
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
  const { data: rows, error } = await db
    .from(cfg.tabela)
    .select(cfg.colunas)
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lista = (rows ?? []) as unknown as Record<string, unknown>[]
  const colunas = cfg.colunas.split(',').map(c => c.trim())
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
