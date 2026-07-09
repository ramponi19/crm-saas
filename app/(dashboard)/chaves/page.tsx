import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { ChavesView, type Chave } from './chaves-view'

export const metadata = { title: 'Chaves' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function ChavesPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: chavesRaw }, { data: imoveis }] = await Promise.all([
    supabase
      .from('chaves_imoveis')
      .select('id, imovel_id, codigo, status, com_quem, retirada_em, devolucao_prevista, observacoes, imoveis!imovel_id(codigo, titulo)')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false }),
    supabase.from('imoveis').select('id, codigo, titulo').eq('empresa_id', empresaId).order('codigo'),
  ])

  type Row = { id: number; imovel_id: number | null; codigo: string | null; status: string; com_quem: string | null; retirada_em: string | null; devolucao_prevista: string | null; observacoes: string | null; imoveis: Embed<{ codigo: string | null; titulo: string | null }> }
  const chaves: Chave[] = ((chavesRaw ?? []) as unknown as Row[]).map((c) => {
    const im = one(c.imoveis)
    return {
      id: c.id, imovel_id: c.imovel_id, codigo: c.codigo, status: c.status,
      com_quem: c.com_quem, retirada_em: c.retirada_em, devolucao_prevista: c.devolucao_prevista, observacoes: c.observacoes,
      imovel_titulo: im?.titulo ?? null, imovel_codigo: im?.codigo ?? null,
    }
  })

  return (
    <>
      <Topbar title="Controle de chaves" />
      <ChavesView
        initial={chaves}
        empresaId={empresaId!}
        imoveis={(imoveis ?? []) as { id: number; codigo: string | null; titulo: string | null }[]}
      />
    </>
  )
}
