import { Card, Badge } from '@/components/ui'
import { formatarData, formatarDataHora, FUSO_PADRAO } from '@/lib/datas'

export interface Acompanhamento {
  dias: { dia: string; recebidas: number; enviadas: number; pelo_crm: number; com_erro: number; usuarios: number }[]
  usuarios_periodo: number
  membros_ativos: number
  canais: { id: number; tipo: string; nome: string | null; loja: string | null; status: string | null; conectado_em: string | null; ultima_msg_em: string | null; ultimo_erro: string | null; ultimo_erro_em: string | null; token_expira_em: string | null }[]
  falhas_recentes: { em: string; canal_id: number | null; erro: string | null }[]
}

const SENTRY_ORG = 'ramponi19'

/**
 * ACOMPANHAMENTO POR EMPRESA (18/11/2026, primeiro piloto): mensagens recebidas e enviadas por dia (e quantas
 * pelo CRM), envios com falha, usuários ativos por dia, canais conectados com o último erro, e o atalho para os
 * erros da empresa no Sentry (tag `empresa` = nome, components/layout/sentry-usuario.tsx). Dia de Brasília.
 * Dados de `acompanhamento_empresa` (só o serviço executa).
 */
export function AcompanhamentoEmpresa({ dados, empresaNome }: { dados: Acompanhamento; empresaNome: string }) {
  const tot = dados.dias.reduce((s, d) => ({
    recebidas: s.recebidas + d.recebidas, enviadas: s.enviadas + d.enviadas, pelo_crm: s.pelo_crm + d.pelo_crm, com_erro: s.com_erro + d.com_erro,
  }), { recebidas: 0, enviadas: 0, pelo_crm: 0, com_erro: 0 })
  const maior = Math.max(1, ...dados.dias.map((d) => Math.max(d.recebidas, d.enviadas)))
  const dataCurta = (d: string) => formatarData(d, { day: '2-digit', month: '2-digit' }, '—', FUSO_PADRAO)
  const quando = (d: string | null) => formatarDataHora(d, undefined, '—', FUSO_PADRAO)
  const sentry = `https://${SENTRY_ORG}.sentry.io/issues/?query=${encodeURIComponent(`empresa:"${empresaNome}"`)}&statsPeriod=14d`

  return (
    <Card title={`Acompanhamento (${dados.dias.length} dias)`}>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ['Recebidas', tot.recebidas], ['Enviadas', tot.enviadas], ['Pelo CRM', tot.pelo_crm],
          ['Envios com falha', tot.com_erro], ['Usuários ativos', `${dados.usuarios_periodo} de ${dados.membros_ativos}`],
        ].map(([rot, v]) => (
          <div key={rot as string} className="rounded-control border border-line px-3 py-2" data-acomp={rot}>
            <div className="num text-[17px] font-semibold text-ink">{v}</div>
            <div className="text-[11.5px] text-ink-3">{rot}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-left text-ink-3">
            <tr>
              <th className="py-1 pr-3 font-medium">Dia</th><th className="py-1 pr-3 font-medium">Recebidas</th><th className="py-1 pr-3 font-medium">Enviadas</th>
              <th className="py-1 pr-3 font-medium">Pelo CRM</th><th className="py-1 pr-3 font-medium">Falhas</th><th className="py-1 pr-3 font-medium">Usuários</th><th className="w-1/3 py-1 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {dados.dias.map((d) => (
              <tr key={d.dia} data-dia={d.dia}>
                <td className="num py-1 pr-3 text-ink-2">{dataCurta(d.dia)}</td>
                <td className="num py-1 pr-3 text-ink">{d.recebidas}</td>
                <td className="num py-1 pr-3 text-ink">{d.enviadas}</td>
                <td className="num py-1 pr-3 text-ink-2">{d.pelo_crm}</td>
                <td className={`num py-1 pr-3 ${d.com_erro ? 'font-semibold text-bad' : 'text-ink-3'}`}>{d.com_erro}</td>
                <td className="num py-1 pr-3 text-ink-2">{d.usuarios}</td>
                <td className="py-1">
                  <div className="flex h-2 gap-0.5" aria-hidden>
                    <div className="rounded-full bg-ink/30" style={{ width: `${(d.recebidas / maior) * 50}%` }} />
                    <div className="rounded-full bg-ink" style={{ width: `${(d.enviadas / maior) * 50}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="mb-1.5 mt-5 text-[12.5px] font-semibold text-ink">Canais ({dados.canais.length})</h4>
      {dados.canais.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">Nenhum canal conectado.</p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-control border border-line text-[12.5px]">
          {dados.canais.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-canal={c.tipo}>
              <span className="text-ink">
                <span className="font-medium capitalize">{c.tipo}</span> · {c.nome ?? 'sem nome'}{c.loja ? ` · ${c.loja}` : ''}
                {c.ultimo_erro && <span className="block text-[11.5px] text-bad">Último erro ({quando(c.ultimo_erro_em)}): {c.ultimo_erro}</span>}
              </span>
              <span className="flex items-center gap-2 text-ink-3">
                <Badge tone={c.status === 'ativo' || c.status === 'conectado' ? 'ok' : 'neutro'}>{c.status ?? '—'}</Badge>
                última mensagem {quando(c.ultima_msg_em)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="mb-1.5 mt-5 text-[12.5px] font-semibold text-ink">Erros</h4>
      {dados.falhas_recentes.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">Nenhum envio com falha no período.</p>
      ) : (
        <ul className="mb-2 space-y-1 text-[12px] text-ink-2">
          {dados.falhas_recentes.map((f, i) => <li key={i}><span className="num text-ink-3">{quando(f.em)}</span> · {f.erro}</li>)}
        </ul>
      )}
      <a href={sentry} target="_blank" rel="noopener" className="text-[12.5px] font-medium underline underline-offset-2">Erros da empresa no Sentry (14 dias)</a>
    </Card>
  )
}
