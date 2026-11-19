import { DOCUMENTOS_LEGAIS, VERSAO_PILOTO, versoesDoCadastro, type DocumentoLegal } from '@/lib/termos'
import { PUBLICADO_EM } from '@/lib/legal-operador'

/** A versão do documento legal (lib/termos.ts): "piloto 0.9" desde 19/11/2026, e é ela que o cadastro registra. */
export function VersaoDocumento({ documento }: { documento: DocumentoLegal }) {
  const versao = versoesDoCadastro()[documento]
  return (
    <p className="mt-2 text-[12.5px] text-ink-3" data-versao={versao}>
      {DOCUMENTOS_LEGAIS[documento].nome} · <strong className="font-semibold text-ink-2">Versão {versao}</strong>
      {versao === VERSAO_PILOTO && ` · publicada em ${PUBLICADO_EM}, para o período de piloto`}
    </p>
  )
}
