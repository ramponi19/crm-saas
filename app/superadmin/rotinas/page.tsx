import { Timer } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Badge, Card, EmptyState } from '@/components/ui'
import { formatarDataHora, FUSO_PADRAO } from '@/lib/datas'
import { situacaoDasRotinas } from '@/lib/rotinas'
import { RotinaMarcarVista } from '@/components/superadmin/rotina-marcar-vista'

export const metadata = { title: 'Rotinas' }

// Superadmin não é de uma empresa: hora de Brasília (o servidor roda em UTC).
const quando = (d: string | null | undefined) => (d ? formatarDataHora(d, undefined, '—', FUSO_PADRAO) : '—')

const TOM: Record<string, 'ok' | 'warn' | 'bad' | 'neutro'> = { ok: 'ok', com_erro: 'bad', falhou: 'bad', rodando: 'warn' }
const ROTULO: Record<string, string> = { ok: 'ok', com_erro: 'com erro', falhou: 'falhou', rodando: 'rodando' }

/**
 * ROTINAS AGENDADAS (entrega 1.1r, 25/11/2026). Cada rotina com a última execução, a última rodada do
 * agendador e se está atrasada; em cima, as execuções com erro ainda não vistas (com a empresa e a mensagem).
 * Tudo vem de rotinas_situacao(), calculada na hora.
 */
export default async function RotinasPage() {
  const situacao = await situacaoDasRotinas(await createClient())

  return (
    <div className="min-h-full bg-bg px-4 py-4 sm:px-8 sm:py-7">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Rotinas agendadas</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">
            O que rodou, o que deu erro em alguma empresa e o que deixou de rodar no horário. Atualizado ao abrir a página.
          </p>
        </div>

        {!situacao ? (
          <Card><EmptyState icon={<Timer size={22} strokeWidth={1.7} />} title="Não foi possível ler as rotinas" description="A função rotinas_situacao não respondeu." /></Card>
        ) : (
          <>
            <Card flush title={`Com erro, não vistas (${situacao.problemas.length})`}>
              {situacao.problemas.length === 0 ? (
                <p className="px-4 py-4 text-[13px] text-ink-3">Nenhuma execução com erro nos últimos 7 dias.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {situacao.problemas.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[13px]">
                      <div className="min-w-[220px] flex-1">
                        <div className="font-semibold text-ink">{p.rotina} <Badge tone="bad" className="ml-1">{ROTULO[p.status] ?? p.status}</Badge></div>
                        <div className="font-mono text-[12px] text-ink-3">{quando(p.inicio)} · {p.origem}</div>
                        {p.erro && <div className="mt-1 break-all text-ink-2">{p.erro}</div>}
                        {(p.empresas ?? []).map((e) => (
                          <div key={e.empresa} className="mt-1 break-all text-ink-2">
                            <span className="font-medium text-ink">{e.nome ?? `Empresa ${e.empresa}`}</span>: {e.erro ?? 'erro'}
                          </div>
                        ))}
                      </div>
                      <RotinaMarcarVista id={p.id} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card flush title="Todas as rotinas">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="px-4 py-3 font-medium text-ink-3">Rotina</th>
                      <th className="px-3 py-3 font-medium text-ink-3">Agenda</th>
                      <th className="px-3 py-3 font-medium text-ink-3">Última execução</th>
                      <th className="px-3 py-3 font-medium text-ink-3">Agendador</th>
                      <th className="px-3 py-3 font-medium text-ink-3">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {situacao.rotinas.map((r) => (
                      <tr key={r.nome} className="border-b border-line/60 align-top last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-ink">{r.nome}</div>
                          <div className="text-[12px] text-ink-3">{r.descricao}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px] text-ink-2">{r.agenda}{r.origem === 'vercel' ? ' · Vercel' : ''}</td>
                        <td className="px-3 py-3">
                          {r.ultima_execucao ? (
                            <>
                              <Badge tone={TOM[r.ultima_execucao.status] ?? 'neutro'}>{ROTULO[r.ultima_execucao.status] ?? r.ultima_execucao.status}</Badge>
                              <div className="mt-1 font-mono text-[12px] text-ink-3">{quando(r.ultima_execucao.inicio)}</div>
                              {r.ultima_execucao.empresas > 0 && (
                                <div className="text-[12px] text-ink-3">
                                  {r.ultima_execucao.empresas} empresa(s){r.ultima_execucao.empresas_erro ? `, ${r.ultima_execucao.empresas_erro} com erro` : ''}
                                </div>
                              )}
                            </>
                          ) : <span className="text-ink-3">{r.condicional ? 'só roda quando há o que fazer' : 'sem registro ainda'}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px] text-ink-3">
                          {r.origem === 'pg_cron' ? `${quando(r.ultima_rodada_agendador)}${r.agendador_status ? ` · ${r.agendador_status}` : ''}` : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {r.atrasada ? <Badge tone="bad">atrasada</Badge> : <Badge tone="ok">em dia</Badge>}
                          {r.motivo_atraso && <div className="mt-1 text-[12px] text-bad">{r.motivo_atraso}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
