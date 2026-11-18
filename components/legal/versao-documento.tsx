import { DOCUMENTOS_LEGAIS, VERSAO_MINUTA, versoesDoCadastro, type DocumentoLegal } from '@/lib/termos'

/** A versão do documento legal (lib/termos.ts): "minuta" até o texto final, e é ela que o cadastro registra. */
export function VersaoDocumento({ documento }: { documento: DocumentoLegal }) {
  const versao = versoesDoCadastro()[documento]
  return (
    <p className="mt-2 text-[12.5px] text-ink-3" data-versao={versao}>
      {DOCUMENTOS_LEGAIS[documento].nome} · versão <strong className="font-semibold text-ink-2">{versao}</strong>
      {versao === VERSAO_MINUTA && ' (texto provisório, em revisão)'}
    </p>
  )
}
