import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { CardapioView, type Item, type Categoria } from './cardapio-view'

export const metadata = { title: 'Cardápio' }

export default async function CardapioPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const [{ data: itens }, { data: cats }, { data: empresa }] = await Promise.all([
    supabase.from('produtos').select('id, nome, categoria_id, preco, descricao, foto_url, disponivel').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    supabase.from('categorias_produtos').select('id, nome').eq('empresa_id', empresaId).order('nome'),
    supabase.from('empresas').select('slug').eq('id', empresaId).maybeSingle(),
  ])

  return (
    <>
      <Topbar title="Cardápio" />
      <CardapioView
        initial={(itens ?? []) as Item[]}
        categorias={(cats ?? []) as Categoria[]}
        empresaId={empresaId!}
        slug={empresa?.slug ?? null}
      />
    </>
  )
}
