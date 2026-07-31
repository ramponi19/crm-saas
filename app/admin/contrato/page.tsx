import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { requireEmpresaRole } from '@/lib/owner'
import { Topbar } from '@/components/layout/topbar'
import { DocumentosView, type DocumentoLista } from './documentos-view'

export const metadata = { title: 'Documentos' }

/** Biblioteca de documentos da loja: contrato de venda, garantia, etc. */
export default async function ContratosPage() {
  await requireEmpresaRole(['owner', 'admin'])
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const { data: docs } = await supabase
    .from('contrato_documentos')
    .select('id, nome, arquivado, updated_at')
    .eq('empresa_id', empresaId).eq('arquivado', false)
    .order('nome')

  const ids = (docs ?? []).map((d) => d.id as number)
  const [{ data: versoes }, { data: emitidos }] = await Promise.all([
    ids.length
      ? supabase.from('contrato_modelos').select('documento_id, versao, paginas')
          .in('documento_id', ids).eq('ativo', true)
      : Promise.resolve({ data: [] }),
    supabase.from('contratos_venda').select('documento_id').eq('empresa_id', empresaId),
  ])

  const porDoc = new Map<number, { versao: number; paginas: number }>()
  for (const v of (versoes ?? []) as { documento_id: number; versao: number; paginas: unknown }[]) {
    porDoc.set(v.documento_id, { versao: v.versao, paginas: Array.isArray(v.paginas) ? v.paginas.length : 0 })
  }
  const contagem = new Map<number, number>()
  for (const e of (emitidos ?? []) as { documento_id: number | null }[]) {
    if (e.documento_id) contagem.set(e.documento_id, (contagem.get(e.documento_id) ?? 0) + 1)
  }

  const documentos: DocumentoLista[] = (docs ?? []).map((d) => ({
    id: d.id as number,
    nome: d.nome as string,
    versao: porDoc.get(d.id as number)?.versao ?? null,
    paginas: porDoc.get(d.id as number)?.paginas ?? 0,
    emitidos: contagem.get(d.id as number) ?? 0,
  }))

  return (
    <>
      <Topbar eyebrow="SISTEMA" title="Documentos" />
      <DocumentosView documentos={documentos} />
    </>
  )
}
