import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Json } from '@/types/database'

const STATUS = ['em_analise', 'ofertado', 'aceito', 'recusado'] as const
type Status = (typeof STATUS)[number]

interface Veiculo {
  categoria?: string; marca?: string; modelo?: string; versao?: string
  ano?: number | null; placa?: string; cor?: string; chassi?: string
}

function limparVeiculo(raw: unknown): Veiculo {
  const o = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown) => { const s = String(v ?? '').trim(); return s || undefined }
  const ano = Number(o.ano)
  return {
    categoria: str(o.categoria), marca: str(o.marca), modelo: str(o.modelo), versao: str(o.versao),
    placa: str(o.placa)?.toUpperCase(), cor: str(o.cor), chassi: str(o.chassi)?.toUpperCase(),
    ano: Number.isFinite(ano) && ano > 0 ? ano : null,
  }
}

const numOrNull = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v !== null ? n : null }

type Sb = Awaited<ReturnType<typeof createClient>>

/** Acha (case-insensitive) ou cria uma linha "nome + empresa_id" e devolve o id. */
async function acharOuCriar(sb: Sb, tabela: 'marcas_produtos' | 'categorias_produtos', empresaId: number, nome: string): Promise<number | null> {
  const n = nome.trim()
  if (!n) return null
  const { data: existe } = await sb.from(tabela).select('id').eq('empresa_id', empresaId).ilike('nome', n).limit(1).maybeSingle()
  if (existe?.id) return existe.id
  const { data: novo } = await sb.from(tabela).insert({ empresa_id: empresaId, nome: n } as never).select('id').single()
  return novo?.id ?? null
}

/** Resolve (ou cria) o "modelo" no catálogo a partir do veículo avaliado. Devolve produto_id ou null. */
async function resolverProduto(sb: Sb, empresaId: number, v: Veiculo): Promise<number | null> {
  const nomeModelo = [v.modelo, v.versao].filter(Boolean).join(' ').trim() || (v.marca ?? '').trim()
  if (!nomeModelo) return null
  const marcaId = v.marca ? await acharOuCriar(sb, 'marcas_produtos', empresaId, v.marca) : null
  const categoriaId = v.categoria ? await acharOuCriar(sb, 'categorias_produtos', empresaId, v.categoria) : null

  // modelo já existe? (mesmo nome + mesma marca)
  let q = sb.from('produtos').select('id').eq('empresa_id', empresaId).ilike('nome', nomeModelo).limit(1)
  if (marcaId != null) q = q.eq('marca_id', marcaId)
  const { data: existe } = await q.maybeSingle()
  if (existe?.id) return existe.id

  const { data: novo } = await sb.from('produtos')
    .insert({ empresa_id: empresaId, nome: nomeModelo, marca_id: marcaId, categoria_id: categoriaId } as never)
    .select('id').single()
  return novo?.id ?? null
}

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const veiculo = limparVeiculo(b.veiculo)
  const { data, error } = await supabase.from('avaliacoes_usados').insert({
    empresa_id: empresaId,
    lead_id: numOrNull(b.lead_id),
    veiculo: veiculo as unknown as Json,
    km: numOrNull(b.km),
    fotos_urls: (typeof b.fotos_urls === 'string' && b.fotos_urls.trim()) ? b.fotos_urls.trim() : null,
    valor_mercado: numOrNull(b.valor_mercado),
    valor_ofertado: numOrNull(b.valor_ofertado),
    observacoes: (typeof b.observacoes === 'string' && b.observacoes.trim()) ? b.observacoes.trim() : null,
    status: 'em_analise',
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}

export async function PATCH(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = Number(b.id)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if ('veiculo' in b) patch.veiculo = limparVeiculo(b.veiculo)
  if ('km' in b) patch.km = numOrNull(b.km)
  if ('fotos_urls' in b) patch.fotos_urls = (typeof b.fotos_urls === 'string' && b.fotos_urls.trim()) ? b.fotos_urls.trim() : null
  if ('valor_mercado' in b) patch.valor_mercado = numOrNull(b.valor_mercado)
  if ('valor_ofertado' in b) patch.valor_ofertado = numOrNull(b.valor_ofertado)
  if ('observacoes' in b) patch.observacoes = (typeof b.observacoes === 'string' && b.observacoes.trim()) ? b.observacoes.trim() : null
  if (typeof b.status === 'string' && (STATUS as readonly string[]).includes(b.status)) patch.status = b.status as Status
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada a atualizar' }, { status: 400 })

  const { error } = await supabase.from('avaliacoes_usados').update(patch as never).eq('id', id).eq('empresa_id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aceite → o usado entra no estoque (uma vez; só se ainda não houver unidade vinculada).
  let unidadeId: number | null = null
  if (patch.status === 'aceito') {
    const { data: av } = await supabase
      .from('avaliacoes_usados')
      .select('id, veiculo, km, valor_ofertado, unidade_id')
      .eq('id', id).eq('empresa_id', empresaId).maybeSingle()
    if (av && !av.unidade_id) {
      const v = (av.veiculo ?? {}) as Veiculo
      const desc = [v.marca, v.modelo, v.versao].filter(Boolean).join(' ')
      const produtoId = await resolverProduto(supabase, empresaId!, v)
      const { data: unidade } = await supabase.from('inventario_unidades').insert({
        empresa_id: empresaId,
        produto_id: produtoId,
        placa: v.placa ?? null,
        chassi: v.chassi ?? null,
        ano: v.ano ?? null,
        cor: v.cor ?? null,
        km: av.km ?? null,
        preco_custo: av.valor_ofertado ?? null,
        condicao: 'usado',
        estado: 'bom',
        tipo: 'troca',
        status: 'disponivel',
        observacoes: `Entrada por avaliação #${av.id}${desc ? ` — ${desc}` : ''}.`,
        ativo: true,
      } as never).select('id').single()
      if (unidade?.id) {
        unidadeId = unidade.id
        await supabase.from('avaliacoes_usados').update({ unidade_id: unidade.id } as never).eq('id', id).eq('empresa_id', empresaId)
      }
    }
  }

  return NextResponse.json({ ok: true, unidadeId })
}

export async function DELETE(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const b = await req.json().catch(() => ({})) as { id?: number }
  if (!b.id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { error } = await supabase.from('avaliacoes_usados').delete().eq('id', b.id).eq('empresa_id', empresaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
