'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { HeartHandshake, Loader2, Check, Circle, X } from 'lucide-react'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

interface Passo {
  id: number; desteNegocio: boolean; passo: string; regua: string | null; dia: string; status: string
  resultado: string | null; feitoEm: string | null; responsavel: string | null; tentativas: number
}
interface Nota { id: number; nota: number; comentario: string | null; dia: string }
interface Chamado { id: number; numero: number; titulo: string; prioridade: string; status: string; resolvido: boolean; aberto: string; atrasado: boolean }
interface Dados { hoje: string; passos: Passo[]; notas: Nota[]; chamados: Chamado[] }

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const STATUS: Record<string, string> = {
  feito: 'feito', sem_resposta: 'sem resposta', pulado: 'pulado', perdido: 'perdido', reagendado: 'reagendado', pendente: 'pendente',
}

/**
 * ABA PÓS-VENDA DO CARD DO LEAD (C7 bloco 2; docs/design-pos-venda.md §2.5.3). Só com o módulo ligado: a rota responde
 * 403 e o painel não aparece. Mostra a régua do cliente (o que foi feito e o que falta), as notas de NPS e os chamados.
 */
export function LeadPosVendaPanel({ leadId }: { leadId: number }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'oculto'>('carregando')

  useEffect(() => {
    let vivo = true
    fetch(`/api/pos-venda/lead/${leadId}`)
      .then(async (r) => {
        if (!vivo) return
        if (!r.ok) { setEstado('oculto'); return }
        setDados(await r.json()); setEstado('ok')
      })
      .catch(() => { if (vivo) setEstado('oculto') })
    return () => { vivo = false }
  }, [leadId])

  if (estado === 'oculto') return null
  return (
    <div className="mt-1 border-t border-line-soft pt-4">
      <div className="mb-2.5 flex items-center gap-2">
        <HeartHandshake size={16} strokeWidth={1.7} className="text-accent" />
        <span className="text-[13.5px] font-semibold text-ink">Pós-venda</span>
        {dados?.notas[0] && (
          <Badge tone={dados.notas[0].nota >= 9 ? 'ok' : dados.notas[0].nota >= 7 ? 'neutro' : 'bad'} className="ml-auto">NPS {dados.notas[0].nota}</Badge>
        )}
      </div>
      {estado === 'carregando' || !dados ? (
        <div className="text-[13px] text-ink-3"><Loader2 size={15} strokeWidth={1.7} className="mr-2 inline animate-spin" />Carregando…</div>
      ) : (
        <div className="flex flex-col gap-3">
          {dados.passos.length === 0 ? (
            <p className="text-[12px] text-ink-3">Nenhum passo de pós-venda para este cliente. A régua começa quando uma venda é marcada como ganha.</p>
          ) : (
            <ol className="flex flex-col gap-1">
              {dados.passos.map((p) => {
                const feito = p.status === 'feito'
                const pendente = p.status === 'pendente'
                const atrasado = pendente && p.dia < dados.hoje
                return (
                  <li key={p.id} className={cn('flex items-start gap-2 text-[12.5px]', !p.desteNegocio && 'opacity-70')}>
                    <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                      feito ? 'bg-ok-soft text-ok' : pendente ? (atrasado ? 'text-bad' : 'text-ink-3') : 'bg-ink/[0.05] text-ink-3')}>
                      {feito ? <Check size={11} strokeWidth={2.4} /> : pendente ? <Circle size={10} strokeWidth={2} /> : <X size={11} strokeWidth={2.2} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate', feito || pendente ? 'text-ink' : 'text-ink-3')}>{p.passo}</span>
                        <span className={cn('num shrink-0 text-[11.5px]', atrasado ? 'text-bad' : 'text-ink-3')}>{ddmm(p.feitoEm ?? p.dia)}</span>
                      </div>
                      <div className="truncate text-[11.5px] text-ink-3">
                        {[!pendente ? STATUS[p.status] ?? p.status : atrasado ? 'atrasado' : null, p.resultado, p.responsavel, p.tentativas > 0 && pendente ? `${p.tentativas}ª tentativa` : null]
                          .filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {dados.notas.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Notas</div>
              {dados.notas.map((n) => (
                <div key={n.id} className="text-[12.5px] text-ink-2"><span className="num font-semibold text-ink">{n.nota}</span> · {ddmm(n.dia)}{n.comentario ? ` · “${n.comentario}”` : ''}</div>
              ))}
            </div>
          )}
          {dados.chamados.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Chamados</div>
              {dados.chamados.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="num text-ink-3">#{c.numero}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{c.titulo}</span>
                  <Badge tone={c.resolvido ? 'ok' : c.atrasado ? 'bad' : 'neutro'}>{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
          <Link href="/pos-venda" className="text-[12px] font-medium text-ink-2 hover:text-ink">Abrir a fila do pós-venda</Link>
        </div>
      )}
    </div>
  )
}
