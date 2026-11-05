import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { AvaliacoesView, type Avaliacao } from './avaliacoes-view'

export const metadata = { title: 'Avaliações' }

export default async function AvaliacoesPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: avaliacoes }, { data: leadsRaw }] = await Promise.all([
    supabase
      .from('avaliacao_usados')
      .select('id, lead_id, veiculo, km, fotos_urls, valor_mercado, valor_ofertado, status, observacoes, unidade_id, created_at')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false }),
    // Lead = negócio ativo; o nome é do contato, e a ordem também (to-one ordena o pai).
    supabase.from('negocios').select('id, contato:contatos!contato_id(nome)')
      .eq('empresa_id', empresaId).eq('ativo', true).order('contato(nome)'),
  ])

  const leads = ((leadsRaw ?? []) as unknown as { id: number; contato: { nome: string | null } | null }[])
    .map((l) => ({ id: l.id, nome: l.contato?.nome ?? null }))

  return (
    <>
      <Topbar title="Avaliações de usados" />
      <AvaliacoesView
        initial={(avaliacoes ?? []) as unknown as Avaliacao[]}
        leads={leads}
      />
    </>
  )
}
