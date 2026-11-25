import { formatCurrency } from '@/lib/utils'
import type { ResumoEmAberto } from '@/lib/vendas-mes'

/**
 * EM ABERTO — encomendas e pendentes de entrega, FORA do faturamento (25/11/2026).
 *
 * Desde o hotfix H1, a encomenda só entra no faturamento no mês em que é entregue. O que ainda não foi
 * entregue aparece aqui, à parte: quanto está comprometido, quanto de sinal já entrou e quanto falta.
 * Painel e Relatórios usam a mesma faixa. Some quando não há nada em aberto.
 */
export function EmAbertoFaixa({ resumo, className }: { resumo: ResumoEmAberto; className?: string }) {
  if (!resumo.pedidos) return null
  const itens: { rotulo: string; valor: string }[] = [
    { rotulo: 'Em aberto', valor: formatCurrency(resumo.valor) },
    { rotulo: 'Sinal recebido', valor: formatCurrency(resumo.sinal) },
    { rotulo: 'Falta receber', valor: formatCurrency(resumo.falta) },
  ]
  return (
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-line bg-card px-4 py-3 ${className ?? ''}`}>
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="text-[11px] uppercase tracking-[0.05em] text-ink-3">{i.rotulo}</div>
          <div className="num text-[18px] font-bold text-ink">{i.valor}</div>
        </div>
      ))}
      <p className="min-w-[220px] flex-1 text-[12px] text-ink-2">
        {resumo.pedidos === 1 ? '1 encomenda ainda não entregue' : `${resumo.pedidos} encomendas ainda não entregues`}.
        {' '}Fora do faturamento: cada uma entra no mês em que for entregue.
      </p>
    </div>
  )
}
