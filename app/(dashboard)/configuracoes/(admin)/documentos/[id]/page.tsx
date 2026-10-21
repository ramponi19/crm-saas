import { notFound } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { Topbar } from '@/components/layout/topbar'
import { garantiaPadraoLoja } from '@/lib/contrato-emitir'
import type { PaginaModelo } from '@/lib/contrato-modelo'
import { ContratoModeloView } from './contrato-modelo-view'

export const metadata = { title: 'Documento' }

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireEmpresaRole(['owner', 'admin'])
  const { id } = await params
  const documentoId = Number(id)
  if (!Number.isFinite(documentoId)) notFound()

  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  // Filtra por empresa junto do id: id de outro tenant devolve 404, não erro.
  const { data: doc } = await supabase
    .from('contrato_documentos')
    .select('id, nome')
    .eq('id', documentoId).eq('empresa_id', empresaId)
    .maybeSingle()
  if (!doc) notFound()

  const [{ data: modelo }, { count: emitidos }, garantia] = await Promise.all([
    supabase.from('contrato_modelos').select('versao, paginas')
      .eq('documento_id', documentoId).eq('ativo', true).maybeSingle(),
    supabase.from('contratos_venda').select('*', { count: 'exact', head: true })
      .eq('documento_id', documentoId),
    garantiaPadraoLoja(supabase, empresaId!),
  ])

  return (
    <>
      <Topbar eyebrow="DOCUMENTOS" title={doc.nome as string} />
      <ContratoModeloView
        empresaId={empresaId!}
        documentoId={documentoId}
        nome={doc.nome as string}
        versao={(modelo?.versao as number | undefined) ?? null}
        paginasIniciais={((modelo?.paginas ?? []) as unknown as PaginaModelo[])}
        garantiaPadrao={garantia}
        contratosEmitidos={emitidos ?? 0}
      />
    </>
  )
}
