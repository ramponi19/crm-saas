import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ranquear, type PerfilBusca, type ImovelMatchInput } from '@/lib/match-imoveis'

/**
 * Imóveis compatíveis com o perfil de busca de um lead.
 * Usa o client com RLS → só enxerga leads/imóveis da própria empresa (isolado).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const leadId = Number(id)
  if (!Number.isFinite(leadId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

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
