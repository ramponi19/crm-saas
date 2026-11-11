import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Vem de GET /api/transmissao e /api/automatize (lib/canais/saude-whatsapp.ts). */
export type AvisoPagamento = { filial_id: number | null; loja: string; texto: string }

/**
 * CONTA DA META SEM FORMA DE PAGAMENTO, por loja (11/11/2026). Modelo abre conversa paga: sem
 * pagamento a Meta aceita o envio e depois devolve "falhou". Mensagem de sessão continua saindo,
 * então só este aviso diz à loja por que a Transmissão e o Automatize não chegam.
 * `filial` limita à loja escolhida (formulário); sem ela, mostra todas.
 */
export function AvisoPagamentoMeta({ avisos, filial, className }: { avisos?: AvisoPagamento[] | null; filial?: number | null; className?: string }) {
  const lista = (avisos ?? []).filter((a) => filial === undefined || a.filial_id === filial || a.filial_id == null)
  if (!lista.length) return null
  return (
    <div role="alert" data-aviso-pagamento className={cn('flex gap-2.5 rounded-card border border-warn/30 bg-warn-soft px-3 py-2.5 text-[12.5px] text-warn', className)}>
      <TriangleAlert size={15} strokeWidth={1.8} className="mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        {lista.map((a) => <p key={`${a.filial_id}`} className="font-semibold" data-aviso-pagamento-loja={a.filial_id ?? 'empresa'}>{a.texto}</p>)}
        <p className="text-ink-2">
          Modelo (Transmissão e Automatize) não chega: a Meta aceita e depois recusa. Cadastre um cartão em
          WhatsApp Manager → Configurações de pagamento. Responder cliente na conversa continua funcionando.
        </p>
      </div>
    </div>
  )
}
