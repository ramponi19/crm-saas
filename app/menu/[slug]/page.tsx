import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import { MenuView, type MenuItem } from './menu-view'

export const metadata = { title: 'Cardápio' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function MenuPublicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const svc = createServiceClient()

  const { data: empresa } = await svc
    .from('empresas').select('id, nome, wl_logo_url, wl_cor, wl_whatsapp').eq('slug', slug).maybeSingle()
  if (!empresa) notFound()

  const { data: raw } = await svc
    .from('produtos')
    .select('id, nome, preco, descricao, foto_url, categoria_id, disponivel, categorias_produtos!categoria_id(nome)')
    .eq('empresa_id', empresa.id).eq('ativo', true).eq('disponivel', true).order('nome')

  type Row = { id: number; nome: string; preco: number | null; descricao: string | null; foto_url: string | null; categoria_id: number | null; categorias_produtos: Embed<{ nome: string | null }> }
  const itens: MenuItem[] = ((raw ?? []) as unknown as Row[]).map((p) => ({
    id: p.id, nome: p.nome, preco: p.preco, descricao: p.descricao, foto_url: p.foto_url,
    categoria: one(p.categorias_produtos)?.nome ?? 'Itens',
  }))

  return (
    <MenuView
      empresaNome={empresa.nome}
      cor={empresa.wl_cor || '#2E5CE6'}
      whatsapp={empresa.wl_whatsapp}
      logo={empresa.wl_logo_url}
      itens={itens}
    />
  )
}
