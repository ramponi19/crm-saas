import { NextResponse } from 'next/server'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { ranquear, type PerfilBusca, type ImovelMatchInput } from '@/lib/match-imoveis'
import { ranquearVeiculos, type InteresseVeiculo, type VeiculoMatchInput } from '@/lib/match-veiculos'

/**
 * Itens compatíveis com o lead. Ramifica por segmento da empresa:
 *  - concessionaria → veículos do estoque × leads.interesse
 *  - demais (imobiliaria) → imóveis × lead_perfil_busca
 * Usa o client com RLS → só enxerga dados da própria empresa (isolado).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const leadId = Number(id)
  if (!Number.isFinite(leadId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: empresa } = await supabase.from('empresas').select('segmento').eq('id', empresaId!).maybeSingle()

  // ── Loja de veículos ──
  // `matchVeiculo`: casa o interesse com unidade de veículo em vez de imóvel.
  if (SEGMENTOS[normalizarSegmento(empresa?.segmento)].capacidades.matchVeiculo) {
    const { data: lead } = await supabase.from('leads').select('interesse').eq('id', leadId).maybeSingle()
    const interesse = (lead?.interesse ?? null) as InteresseVeiculo | null
    if (!interesse) return NextResponse.json({ matches: [] })

    const { data: unidades } = await supabase
      .from('inventario_unidades')
      .select('id, ano, km, cor, preco_venda, status, produtos!produto_id(nome, marcas_produtos!marca_id(nome), categorias_produtos!categoria_id(nome))')
      .eq('ativo', true)

    type Embed<T> = T | T[] | null
    const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)
    type Row = {
      id: number; ano: number | null; km: number | null; cor: string | null
      preco_venda: number | null; status: string | null
      produtos: Embed<{ nome: string | null; marcas_produtos: Embed<{ nome: string | null }>; categorias_produtos: Embed<{ nome: string | null }> }>
    }
    const veiculos: VeiculoMatchInput[] = ((unidades ?? []) as unknown as Row[]).map((u) => {
      const prod = one(u.produtos)
      return {
        id: u.id, ano: u.ano, km: u.km, cor: u.cor, preco_venda: u.preco_venda, status: u.status,
        produto_nome: prod?.nome ?? null,
        marca_nome: one(prod?.marcas_produtos ?? null)?.nome ?? null,
        categoria_nome: one(prod?.categorias_produtos ?? null)?.nome ?? null,
      }
    })

    const matches = ranquearVeiculos(interesse, veiculos).slice(0, 20)
    return NextResponse.json({ matches })
  }

  // ── Imobiliária (padrão) ──
  const { data: perfil } = await supabase
    .from('lead_perfil_busca')
    .select('finalidade, tipos, cidades, bairros, preco_min, preco_max, quartos_min, vagas_min')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (!perfil) return NextResponse.json({ matches: [] })

  const { data: imoveis } = await supabase
    .from('imoveis')
    .select('id, codigo, titulo, tipo, finalidade, status, bairro, cidade, valor_venda, valor_locacao, quartos, vagas')

  const matches = ranquear(perfil as PerfilBusca, (imoveis ?? []) as ImovelMatchInput[]).slice(0, 20)
  return NextResponse.json({ matches })
}
