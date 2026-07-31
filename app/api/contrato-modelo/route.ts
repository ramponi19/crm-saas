import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import type { PaginaModelo } from '@/lib/contrato-modelo'

/**
 * Modelo de contrato da empresa. Só owner/admin — é parametrização.
 *
 * Salvar NUNCA edita no lugar: cria uma versão nova e desativa a anterior. As
 * versões antigas ficam porque o HTML já arquivado em contratos_venda aponta
 * para os fundos daquela versão no Storage.
 */

export async function GET() {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { supabase, empresaId } = auth

  const { data, error } = await supabase
    .from('contrato_modelos')
    .select('id, versao, paginas, created_at')
    .eq('empresa_id', empresaId).eq('ativo', true)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ modelo: data ?? null })
}

export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { supabase, empresaId, userId } = auth

  let body: { paginas?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 }) }

  if (!Array.isArray(body.paginas)) {
    return NextResponse.json({ error: 'Envie a lista de páginas' }, { status: 400 })
  }
  if (body.paginas.length === 0) {
    return NextResponse.json({ error: 'O modelo precisa de ao menos uma página' }, { status: 400 })
  }
  if (body.paginas.length > 40) {
    return NextResponse.json({ error: 'Máximo de 40 páginas' }, { status: 400 })
  }

  // Normaliza: descarta campo estranho e reordena de 1..N.
  const paginas: PaginaModelo[] = (body.paginas as Record<string, unknown>[]).map((p, i) => ({
    ordem: i + 1,
    fundo_url: typeof p.fundo_url === 'string' && p.fundo_url.trim() ? p.fundo_url.trim() : null,
    escuro: p.escuro === true,
    texto_html: typeof p.texto_html === 'string' ? p.texto_html : '',
  }))

  // Uma página sem fundo E sem texto não imprime nada — barra antes de gravar.
  if (paginas.every((p) => !p.fundo_url && !p.texto_html.trim())) {
    return NextResponse.json({ error: 'O modelo está vazio: nenhuma página tem fundo ou texto' }, { status: 400 })
  }

  const { data: ult } = await supabase
    .from('contrato_modelos').select('versao')
    .eq('empresa_id', empresaId).order('versao', { ascending: false }).limit(1).maybeSingle()
  const versao = ((ult?.versao as number | undefined) ?? 0) + 1

  // Desativa a anterior ANTES de inserir: o índice único de "um ativo por
  // empresa" recusaria as duas ativas ao mesmo tempo.
  const { error: eOff } = await supabase
    .from('contrato_modelos').update({ ativo: false }).eq('empresa_id', empresaId).eq('ativo', true)
  if (eOff) return NextResponse.json({ error: eOff.message }, { status: 500 })

  const { data, error } = await supabase
    .from('contrato_modelos')
    .insert({ empresa_id: empresaId, versao, paginas, ativo: true, criado_por: userId } as never)
    .select('id, versao').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, modelo: data })
}
