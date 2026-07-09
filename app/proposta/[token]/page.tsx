import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { PrintButton } from './print-button'

export const metadata = { title: 'Proposta' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)
interface Item { descricao: string; qtd: number; valor: number }
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function PropostaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // Leitura pública pelo token (segredo do link) via service — sem auth.
  const svc = createServiceClient()
  const { data } = await svc
    .from('propostas')
    .select('cliente_nome, itens, observacoes, total, status, created_at, empresa:empresas(nome, wl_logo_url, wl_cor, wl_whatsapp)')
    .eq('token', token)
    .maybeSingle()

  if (!data) notFound()

  const d = data as unknown as {
    cliente_nome: string; itens: unknown; observacoes: string | null; total: number; created_at: string | null
    empresa: Embed<{ nome: string; wl_logo_url: string | null; wl_cor: string | null; wl_whatsapp: string | null }>
  }
  const empresa = one(d.empresa)
  const itens = (Array.isArray(d.itens) ? d.itens : []) as unknown as Item[]
  const cor = empresa?.wl_cor || '#2E5CE6'
  const dataFmt = d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''

  return (
    <div className="min-h-screen bg-bg px-4 py-8 text-ink">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      <div className="mx-auto max-w-[720px]">
        <div className="mb-4 flex justify-end"><PrintButton /></div>

        <div className="rounded-card border border-line bg-card p-8 shadow-[0_1px_2px_rgba(21,24,28,0.04)]">
          {/* Cabeçalho do tenant */}
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-line-soft pb-5">
            <div className="flex items-center gap-3">
              {empresa?.wl_logo_url
                ? <Image src={empresa.wl_logo_url} alt={empresa?.nome ?? ''} width={120} height={48} className="h-10 w-auto object-contain" unoptimized />
                : <span className="text-[18px] font-bold tracking-[-0.02em]" style={{ color: cor }}>{empresa?.nome}</span>}
            </div>
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Proposta</div>
              <div className="text-[12px] text-ink-3">{dataFmt}</div>
            </div>
          </div>

          <p className="mb-1 text-[13px] text-ink-3">Para</p>
          <p className="mb-6 text-[18px] font-bold tracking-[-0.02em]">{d.cliente_nome || '—'}</p>

          {/* Itens */}
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line-soft text-[11px] uppercase tracking-[0.08em] text-ink-3">
                <th className="py-2 text-left font-semibold">Item</th>
                <th className="py-2 text-center font-semibold">Qtd</th>
                <th className="py-2 text-right font-semibold">Valor</th>
                <th className="py-2 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it, i) => (
                <tr key={i} className="border-b border-line-soft">
                  <td className="py-2.5">{it.descricao}</td>
                  <td className="num py-2.5 text-center text-ink-2">{it.qtd}</td>
                  <td className="num py-2.5 text-right text-ink-2">{brl(it.valor)}</td>
                  <td className="num py-2.5 text-right font-semibold">{brl(it.qtd * it.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <div className="text-right">
              <div className="text-[12px] text-ink-3">Total</div>
              <div className="num text-[24px] font-bold tracking-[-0.02em]" style={{ color: cor }}>{brl(Number(d.total))}</div>
            </div>
          </div>

          {d.observacoes && (
            <div className="mt-6 border-t border-line-soft pt-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Observações</div>
              <p className="whitespace-pre-line text-[13px] text-ink-2">{d.observacoes}</p>
            </div>
          )}

          <div className="mt-8 border-t border-line-soft pt-4 text-center text-[12px] text-ink-3">
            {empresa?.nome}{empresa?.wl_whatsapp ? ` · ${empresa.wl_whatsapp}` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
