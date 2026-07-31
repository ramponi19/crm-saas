import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { Topbar } from '@/components/layout/topbar'
import { garantiaPadraoLoja } from '@/lib/contrato-emitir'
import type { PaginaModelo } from '@/lib/contrato-modelo'
import { ContratoModeloView } from './contrato-modelo-view'

export const metadata = { title: 'Contrato' }

export default async function ContratoPage() {
  await requireEmpresaRole(['owner', 'admin'])
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const [{ data: modelo }, { count: emitidos }, garantia] = await Promise.all([
    supabase.from('contrato_modelos').select('id, versao, paginas')
      .eq('empresa_id', empresaId).eq('ativo', true).maybeSingle(),
    supabase.from('contratos_venda').select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    garantiaPadraoLoja(supabase, empresaId!),
  ])

  return (
    <>
      <Topbar eyebrow="SISTEMA" title="Contrato de venda" />
      <ContratoModeloView
        empresaId={empresaId!}
        versao={(modelo?.versao as number | undefined) ?? null}
        paginasIniciais={((modelo?.paginas ?? []) as PaginaModelo[])}
        garantiaPadrao={garantia}
        contratosEmitidos={emitidos ?? 0}
      />
    </>
  )
}
