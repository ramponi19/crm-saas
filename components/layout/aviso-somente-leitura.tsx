import { Eye } from 'lucide-react'

/**
 * Faixa do cargo Consulta (etapa 1.1b): a conta vê tudo o que o cargo permite e não grava nada. O banco recusa
 * qualquer escrita (sessao_pode_escrever); a faixa só avisa por que os botões de salvar não funcionam.
 */
export function AvisoSomenteLeitura() {
  return (
    <div role="status" className="flex items-center gap-2 border-b border-line bg-accent-soft px-4 py-1.5 text-[12.5px] text-accent">
      <Eye size={14} strokeWidth={1.8} className="shrink-0" />
      <span>Conta de consulta: você vê as informações, mas não consegue gravar, mover nem enviar nada.</span>
    </div>
  )
}
