import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'

/**
 * Biblioteca de documentos da loja (contrato de venda, termo de garantia…).
 * Só owner/admin: é parametrização.
 *
 * Excluir ARQUIVA em vez de apagar — o modelo não se perde por engano. Contrato
 * já emitido nunca depende disto: ele guarda a própria cópia do documento.
 */

const NOME_MAX = 80

export async function GET(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { supabase, empresaId } = auth

  const incluirArquivados = new URL(req.url).searchParams.get('arquivados') === '1'
  let q = supabase
    .from('contrato_documentos')
    .select('id, nome, arquivado, created_at, updated_at')
    .eq('empresa_id', empresaId)
  if (!incluirArquivados) q = q.eq('arquivado', false)

  const { data, error } = await q.order('nome')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Versão ativa e nº de páginas de cada documento, numa consulta só.
  const ids = (data ?? []).map((d) => d.id as number)
  const versoes = ids.length
    ? (await supabase.from('contrato_modelos')
        .select('documento_id, versao, paginas')
        .in('documento_id', ids).eq('ativo', true)).data ?? []
    : []

  const porDoc = new Map<number, { versao: number; paginas: number }>()
  for (const v of versoes as { documento_id: number; versao: number; paginas: unknown }[]) {
    porDoc.set(v.documento_id, {
      versao: v.versao,
      paginas: Array.isArray(v.paginas) ? v.paginas.length : 0,
    })
  }

  return NextResponse.json({
    documentos: (data ?? []).map((d) => ({
      ...d,
      versao: porDoc.get(d.id as number)?.versao ?? null,
      paginas: porDoc.get(d.id as number)?.paginas ?? 0,
    })),
  })
}

export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { supabase, empresaId, userId } = auth

  let body: { nome?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 }) }

  const nome = typeof body.nome === 'string' ? body.nome.trim().slice(0, NOME_MAX) : ''
  if (!nome) return NextResponse.json({ error: 'Dê um nome ao documento' }, { status: 400 })

  const { data, error } = await supabase
    .from('contrato_documentos')
    .insert({ empresa_id: empresaId, nome, criado_por: userId } as never)
    .select('id, nome').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ documento: data })
}

/**
 * Excluir de verdade — para quando o documento subiu errado.
 *
 * Se já houve emissão, exige `cienteDasEmissoes`. Não é para atrapalhar: é para
 * a exclusão ser uma decisão informada, e não um clique. Os contratos já
 * emitidos NÃO se perdem — cada um guarda a própria cópia do HTML e o nome
 * congelado, então a 2ª via continua saindo. O que eles perdem é o vínculo com o
 * modelo (a coluna vira nula), o que só afeta a contagem por documento.
 *
 * Limpa também os fundos no Storage — sem isso cada reimportação deixaria as
 * imagens da versão anterior para trás.
 */
export async function DELETE(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { supabase, empresaId } = auth

  let body: { id?: unknown; cienteDasEmissoes?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 }) }
  const id = Number(body.id)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Documento inválido' }, { status: 400 })

  const { count: emitidos } = await supabase
    .from('contratos_venda').select('*', { count: 'exact', head: true })
    .eq('documento_id', id)
  if ((emitidos ?? 0) > 0 && body.cienteDasEmissoes !== true) {
    return NextResponse.json({
      error: `Este documento já foi emitido ${emitidos} vez(es) — confirme que está ciente para excluir.`,
      emitidos,
    }, { status: 409 })
  }

  // Reúne os fundos de TODAS as versões antes de apagar as linhas.
  const { data: versoes } = await supabase
    .from('contrato_modelos').select('paginas').eq('documento_id', id)
  const caminhos: string[] = []
  for (const v of (versoes ?? []) as { paginas: unknown }[]) {
    for (const p of (Array.isArray(v.paginas) ? v.paginas : []) as { fundo_url?: string | null }[]) {
      const url = p?.fundo_url
      if (typeof url !== 'string') continue
      // .../storage/v1/object/public/contratos/<empresa>/<arquivo>
      const m = url.match(/\/object\/public\/contratos\/(.+)$/)
      if (m?.[1]?.startsWith(`${empresaId}/`)) caminhos.push(decodeURIComponent(m[1]))
    }
  }

  const { error } = await supabase
    .from('contrato_documentos').delete().eq('id', id).eq('empresa_id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort: o documento já foi. Falhar aqui só deixa imagem órfã.
  let fundosRemovidos = 0
  if (caminhos.length) {
    const { data } = await supabase.storage.from('contratos').remove([...new Set(caminhos)])
    fundosRemovidos = data?.length ?? 0
  }

  return NextResponse.json({ ok: true, fundosRemovidos })
}

/** Renomear e arquivar/desarquivar. */
export async function PATCH(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { supabase, empresaId } = auth

  let body: { id?: unknown; nome?: unknown; arquivado?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 }) }

  const id = Number(body.id)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Documento inválido' }, { status: 400 })

  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.nome === 'string') {
    const nome = body.nome.trim().slice(0, NOME_MAX)
    if (!nome) return NextResponse.json({ error: 'O nome não pode ficar vazio' }, { status: 400 })
    campos.nome = nome
  }
  if (typeof body.arquivado === 'boolean') campos.arquivado = body.arquivado

  // Filtra por empresa junto do id: sem isso, um id de outro tenant passaria
  // pela RLS de UPDATE apenas por sorte da policy.
  const { error } = await supabase
    .from('contrato_documentos').update(campos as never)
    .eq('id', id).eq('empresa_id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
