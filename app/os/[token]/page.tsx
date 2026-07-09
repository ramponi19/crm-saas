import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { AprovacaoOS } from './aprovacao-os'

export const metadata = { title: 'Orçamento' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)
const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

export default async function OrcamentoPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const svc = createServiceClient()
  const { data } = await svc
    .from('garantias_assistencias')
    .select('id, protocolo, defeito_relatado, parecer_tecnico, orcamento_valor, status, aprovado_em, recusado_em, created_at, produtos(nome), clientes(nome), empresa:empresas(nome, wl_logo_url, wl_cor, wl_whatsapp)')
    .eq('token', token).maybeSingle()

  if (!data) notFound()

  const d = data as unknown as {
    protocolo: string | null; defeito_relatado: string | null; parecer_tecnico: string | null
    orcamento_valor: number | null; status: string | null; aprovado_em: string | null; recusado_em: string | null; created_at: string | null
    produtos: Embed<{ nome: string | null }>; clientes: Embed<{ nome: string | null }>
    empresa: Embed<{ nome: string; wl_logo_url: string | null; wl_cor: string | null; wl_whatsapp: string | null }>
  }
  const empresa = one(d.empresa)
  const cor = empresa?.wl_cor || '#2E5CE6'
  const respondido = !!(d.aprovado_em || d.recusado_em)
  const aprovado = !!d.aprovado_em

  return (
    <div className="min-h-screen bg-bg px-4 py-8 text-ink">
      <div className="mx-auto max-w-[560px]">
        <div className="rounded-card border border-line bg-card p-8 shadow-[0_1px_2px_rgba(21,24,28,0.04)]">
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-line-soft pb-5">
            {empresa?.wl_logo_url
              ? <Image src={empresa.wl_logo_url} alt={empresa?.nome ?? ''} width={120} height={48} className="h-10 w-auto object-contain" unoptimized />
              : <span className="text-[18px] font-bold tracking-[-0.02em]" style={{ color: cor }}>{empresa?.nome}</span>}
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Orçamento</div>
              <div className="num text-[12px] text-ink-3">{d.protocolo ?? ''}</div>
            </div>
          </div>

          {one(d.clientes)?.nome && <p className="mb-4 text-[14px]">Olá, <strong>{one(d.clientes)?.nome}</strong> 👋</p>}

          <div className="space-y-3 text-[13.5px]">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Aparelho / item</div>
              <div className="text-ink">{one(d.produtos)?.nome ?? '—'}</div>
            </div>
            {d.defeito_relatado && (
              <div><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Problema relatado</div><div className="text-ink-2">{d.defeito_relatado}</div></div>
            )}
            {d.parecer_tecnico && (
              <div><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Diagnóstico</div><div className="text-ink-2">{d.parecer_tecnico}</div></div>
            )}
          </div>

          <div className="mt-6 flex items-end justify-between border-t border-line-soft pt-5">
            <span className="text-[13px] text-ink-3">Valor do orçamento</span>
            <span className="num text-[26px] font-bold tracking-[-0.02em]" style={{ color: cor }}>{brl(d.orcamento_valor)}</span>
          </div>

          <div className="mt-6">
            {respondido ? (
              <div className={`rounded-control border p-4 text-center text-[14px] font-semibold ${aprovado ? 'border-ok/30 bg-ok-soft text-ok' : 'border-bad/30 bg-bad-soft text-bad'}`}>
                {aprovado ? '✓ Orçamento aprovado. Obrigado!' : 'Orçamento recusado.'}
              </div>
            ) : (
              <AprovacaoOS token={token} />
            )}
          </div>

          <div className="mt-6 border-t border-line-soft pt-4 text-center text-[12px] text-ink-3">
            {empresa?.nome}{empresa?.wl_whatsapp ? ` · ${empresa.wl_whatsapp}` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
