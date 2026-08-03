'use client'

import { useState } from 'react'

export interface OrcamentoPublico {
  token: string
  tipo: string
  status: string
  cliente_nome: string
  aparelho: string | null
  imei: string | null
  defeito: string | null
  prazo_dias: number | null
  garantia_dias: number | null
  itens: { descricao: string; qtd: number; valor: number }[]
  aparelho_novo: string | null
  valor_novo: number | null
  aparelho_usado: string | null
  valor_entrada: number | null
  total: number
  valor_devolver: number
  acerto: string | null
  observacoes: string | null
  created_at: string | null
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const TIPO_LABEL: Record<string, string> = { assistencia: 'Orçamento de conserto', melhoria: 'Orçamento de upgrade', downgrade: 'Proposta de downgrade' }
// Como a loja acerta o saldo que sobrou a favor do cliente. Texto na voz dele,
// porque é ele que lê esta página.
const ACERTO_CLIENTE: Record<string, string> = {
  dinheiro: 'Você recebe em dinheiro',
  credito: 'Você recebe como crédito na loja',
  produto: 'Abatido em produto ou serviço',
  nenhum: 'Sem devolução, conforme combinado',
}

export function OrcamentoPublicoView({ dados, empresaNome, cor, logo }: { dados: OrcamentoPublico; empresaNome: string; cor: string; logo: string | null }) {
  const [status, setStatus] = useState(dados.status)
  const [busy, setBusy] = useState(false)
  const finalizado = status === 'aprovado' || status === 'recusado'

  async function responder(acao: 'aprovar' | 'recusar') {
    setBusy(true)
    const r = await fetch(`/api/orcamento/${dados.token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao }) })
    setBusy(false)
    if (r.ok) setStatus(acao === 'aprovar' ? 'aprovado' : 'recusado')
    else alert('Não foi possível registrar. Tente novamente.')
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="mx-auto max-w-[560px] px-4 py-8">
        {/* Cabeçalho */}
        <div className="mb-5 flex items-center gap-3">
          {logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logo} alt={empresaNome} className="h-11 w-auto object-contain" />
            : <span className="grid h-11 w-11 place-items-center rounded-card text-[18px] font-bold text-white" style={{ background: cor }}>{empresaNome.charAt(0)}</span>}
          <div>
            <div className="text-[15px] font-bold tracking-[-0.02em]">{empresaNome}</div>
            <div className="text-[12px] text-ink-3">{TIPO_LABEL[dados.tipo] ?? 'Orçamento'}</div>
          </div>
        </div>

        <div className="rounded-card border border-line bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] text-ink-3">Para</span>
            <span className="text-[14px] font-semibold">{dados.cliente_nome}</span>
          </div>

          {/* Aparelho (assistência/melhoria) */}
          {(dados.tipo === 'assistencia' || dados.tipo === 'melhoria') && (
            <>
              {(dados.aparelho || dados.imei || dados.defeito) && (
                <div className="mb-3 space-y-1 rounded-control border border-line-soft bg-bg p-3 text-[13px]">
                  {dados.aparelho && <div><span className="text-ink-3">Aparelho:</span> <span className="font-medium">{dados.aparelho}</span></div>}
                  {dados.imei && <div><span className="text-ink-3">IMEI/Série:</span> <span className="num">{dados.imei}</span></div>}
                  {dados.defeito && <div><span className="text-ink-3">Diagnóstico:</span> {dados.defeito}</div>}
                </div>
              )}
              <div className="overflow-hidden rounded-control border border-line-soft">
                {dados.itens.map((it, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-line-soft px-3 py-2 text-[13px] last:border-0">
                    <span>{it.qtd > 1 ? `${it.qtd}× ` : ''}{it.descricao}</span>
                    <span className="num font-medium">{brl(it.qtd * it.valor)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Downgrade */}
          {dados.tipo === 'downgrade' && (
            <div className="space-y-2 text-[13.5px]">
              <div className="flex items-center justify-between rounded-control border border-line-soft px-3 py-2.5">
                <span>{dados.aparelho_novo || 'Aparelho novo'}</span>
                <span className="num font-medium">{brl(dados.valor_novo || 0)}</span>
              </div>
              <div className="flex items-center justify-between rounded-control border border-line-soft px-3 py-2.5 text-ok">
                <span>Entrada: {dados.aparelho_usado || 'seu aparelho'}</span>
                <span className="num font-medium">− {brl(dados.valor_entrada || 0)}</span>
              </div>
              {/* Acessórios/serviços que entraram na negociação. */}
              {dados.itens.filter((it) => it.descricao).map((it, i) => (
                <div key={i} className="flex items-center justify-between rounded-control border border-line-soft px-3 py-2.5">
                  <span>{it.qtd > 1 ? `${it.qtd}× ` : ''}{it.descricao}</span>
                  <span className="num font-medium">{brl(it.qtd * it.valor)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Total — ou o cliente paga, ou a loja acerta com ele. */}
          <div className="mt-4 flex items-end justify-between border-t border-line pt-3">
            <div>
              <div className="text-[12px] text-ink-3">
                {dados.valor_devolver > 0
                  ? (ACERTO_CLIENTE[dados.acerto ?? ''] ?? 'Você recebe')
                  : dados.tipo === 'downgrade' ? 'Você paga' : 'Total'}
              </div>
              {dados.prazo_dias ? <div className="text-[11px] text-ink-3">Prazo: {dados.prazo_dias} dias{dados.garantia_dias ? ` · Garantia: ${dados.garantia_dias} dias` : ''}</div> : null}
            </div>
            {dados.valor_devolver > 0 ? (
              <div className="num text-[26px] font-bold text-ok">{brl(dados.valor_devolver)}</div>
            ) : (
              <div className="num text-[26px] font-bold" style={{ color: cor }}>{brl(dados.total)}</div>
            )}
          </div>

          {dados.observacoes && <p className="mt-3 text-[12px] text-ink-3">{dados.observacoes}</p>}
        </div>

        {/* Ações */}
        {finalizado ? (
          <div className={`mt-5 rounded-card border p-4 text-center text-[14px] font-semibold ${status === 'aprovado' ? 'border-ok/30 bg-ok-soft text-ok' : 'border-bad/30 bg-bad-soft text-bad'}`}>
            {status === 'aprovado' ? 'Orçamento aprovado. Obrigado!' : 'Orçamento recusado.'}
          </div>
        ) : (
          <div className="no-print mt-5 grid grid-cols-2 gap-3">
            <button onClick={() => responder('recusar')} disabled={busy} className="h-12 rounded-control border border-line bg-card text-[14px] font-semibold text-ink-2 disabled:opacity-50">Recusar</button>
            <button onClick={() => responder('aprovar')} disabled={busy} className="h-12 rounded-control text-[14px] font-semibold text-white disabled:opacity-50" style={{ background: cor }}>{busy ? '…' : 'Aprovar'}</button>
          </div>
        )}
        <button onClick={() => window.print()} className="no-print mt-3 w-full text-[12.5px] text-ink-3 underline">Baixar / imprimir</button>
      </div>
    </div>
  )
}
