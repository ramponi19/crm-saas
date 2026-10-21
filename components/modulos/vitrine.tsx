'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Card, StatCard, Button, notify } from '@/components/ui'
import type { VitrineModulo } from '@/lib/modulos-vitrine'

/**
 * A vitrine de um módulo desligado — um componente para os três (Agenda,
 * Executivo, Gestão de Leads). O conteúdo vem de lib/modulos-vitrine.ts; quem
 * monta o contexto (papel, pedido aberto, se o segmento tem a tela) é
 * components/modulos/vitrine-do-modulo.tsx, no servidor.
 *
 * O botão "Ativar":
 *   - superadmin: liga o módulo para esta empresa (/api/modulos/ativar);
 *   - dono/admin: deixa um PEDIDO (/api/modulos/pedido), que o superadmin vê
 *     na tela da empresa — hoje só o superadmin liga módulo;
 *   - demais papéis: sem botão; quem decide é o dono.
 */
export interface VitrineProps {
  href: string
  modulo: VitrineModulo
  papel: 'superadmin' | 'dono' | 'equipe'
  /** O segmento tem a tela? Sem ela, ativar não entrega nada. */
  suportado: boolean
  /** Quando o pedido em aberto desta empresa foi feito, se houver. */
  pedidoEm: string | null
}

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

export function Vitrine({ href, modulo, papel, suportado, pedidoEm }: VitrineProps) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [pedido, setPedido] = useState(pedidoEm)
  const [ativado, setAtivado] = useState(false)

  async function ativar() {
    setEnviando(true)
    try {
      const rota = papel === 'superadmin' ? '/api/modulos/ativar' : '/api/modulos/pedido'
      const r = await fetch(rota, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modulo: href }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify.bad(j.error ?? 'Não deu certo. Tente de novo.'); return }
      if (papel === 'superadmin') {
        setAtivado(true)
        notify.ok(`${modulo.nome} ativado nesta empresa.`)
      } else {
        setPedido(j.pedido_em ?? new Date().toISOString())
        notify.ok('Pedido enviado.')
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-8 scrollbar-thin sm:px-6">
      <div className="mx-auto max-w-[760px]">
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-control bg-accent-soft text-accent">
              <Sparkles size={18} strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Módulo desligado nesta loja</div>
              <h1 className="mt-0.5 text-[22px] font-bold tracking-[-0.03em] text-ink">{modulo.nome}</h1>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{modulo.frase}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 overflow-hidden rounded-card border border-line sm:grid-cols-3 [&>*]:border-line-soft [&>*:not(:last-child)]:border-b sm:[&>*:not(:last-child)]:border-b-0 sm:[&>*:not(:last-child)]:border-r">
            {modulo.numeros.map((n) => (
              <StatCard key={n.rotulo} bare label={n.rotulo} value={n.valor} />
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">Números de exemplo, para mostrar o tipo de leitura. Não são da sua loja.</p>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
            {papel === 'equipe' ? (
              <span className="text-[12.5px] text-ink-2">Quem ativa módulos é o dono da loja. Se você precisa desta tela, fale com ele.</span>
            ) : papel === 'superadmin' && !suportado ? (
              <>
                <Button disabled>Ativar</Button>
                <span className="text-[12.5px] text-ink-2">O segmento desta loja ainda não tem a tela de {modulo.nome}: ativar não basta.</span>
              </>
            ) : ativado ? (
              <>
                <Button onClick={() => router.push(href)}>Abrir {modulo.nome}</Button>
                <span className="text-[12.5px] text-ink-2">Ativado. Pode levar até um minuto para a tela abrir.</span>
              </>
            ) : papel === 'dono' && pedido ? (
              <>
                <Button disabled>Pedido enviado</Button>
                <span className="text-[12.5px] text-ink-2">Pedido feito em {dia(pedido)}. O suporte do Nexus libera e o módulo aparece no menu.</span>
              </>
            ) : (
              <>
                <Button loading={enviando} onClick={ativar}>Ativar</Button>
                <span className="text-[12.5px] text-ink-2">
                  {papel === 'superadmin' ? 'Liga o módulo para esta empresa.'
                    : suportado ? 'Hoje quem liga é o suporte do Nexus: o botão envia o pedido.'
                    // O pedido vale mesmo assim: é como o Nexus fica sabendo que a vertical precisa da tela.
                    : `O segmento desta loja ainda não tem a tela de ${modulo.nome}. O pedido avisa o Nexus de que você quer.`}
                </span>
              </>
            )}
          </div>
        </Card>
      </div>
    </main>
  )
}
