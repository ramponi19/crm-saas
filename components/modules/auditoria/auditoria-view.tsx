import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, EmptyState, controlClass } from '@/components/ui'
import { formatarDataHora } from '@/lib/datas'
import {
  diferencas, rotuloAcao, rotuloEntidade, POR_PAGINA, type EventoAuditoria, type FiltroAuditoria,
} from '@/lib/auditoria'

/**
 * AUDITORIA (etapa 1.1a). Sem estado no navegador: os filtros são um formulário GET (a URL é o filtro) e o
 * "antes → depois" abre num <details>. Quem entrou pela plataforma (superadmin) aparece como "Equipe Nexus".
 */
export function AuditoriaView({ eventos, total, filtro, pessoas, fuso, erro }: {
  eventos: EventoAuditoria[]
  total: number
  filtro: FiltroAuditoria
  pessoas: { id: string; nome: string }[]
  fuso: string
  erro: string | null
}) {
  const nome = new Map(pessoas.map((p) => [p.id, p.nome]))
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const link = (pagina: number) => {
    const q = new URLSearchParams()
    if (filtro.pessoa) q.set('pessoa', filtro.pessoa)
    if (filtro.entidade) q.set('entidade', filtro.entidade)
    if (filtro.acao) q.set('acao', filtro.acao)
    if (filtro.de) q.set('de', filtro.de)
    if (filtro.ate) q.set('ate', filtro.ate)
    if (filtro.plataforma) q.set('plataforma', '1')
    if (pagina > 1) q.set('pagina', String(pagina))
    const s = q.toString()
    return `/configuracoes/auditoria${s ? `?${s}` : ''}`
  }
  const campo = `${controlClass(false)} h-8 px-2`

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[1080px] space-y-4">
        <p className="text-[13px] text-ink-2">
          Quem mudou o quê, quando, com o valor de antes e de depois. Os registros não podem ser alterados nem apagados.
        </p>

        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Pessoa
            <select name="pessoa" defaultValue={filtro.pessoa ?? ''} className={campo}>
              <option value="">Todas</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            O quê
            <select name="entidade" defaultValue={filtro.entidade ?? ''} className={campo}>
              <option value="">Tudo</option>
              {['config', 'cargo', 'usuario', 'plataforma'].map((e) => <option key={e} value={e}>{rotuloEntidade(e)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            De
            <input type="date" name="de" defaultValue={filtro.de ?? ''} className={campo} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Até
            <input type="date" name="ate" defaultValue={filtro.ate ?? ''} className={campo} />
          </label>
          <label className="flex h-8 items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" name="plataforma" value="1" defaultChecked={filtro.plataforma} />
            Só acessos da plataforma
          </label>
          <Button type="submit" size="sm">Filtrar</Button>
          <Link href="/configuracoes/auditoria" className="h-8 px-2 text-[13px] leading-8 text-ink-3 hover:text-ink">Limpar</Link>
        </form>

        {erro && <p className="text-[13px] text-bad">{erro}</p>}

        {!erro && eventos.length === 0 ? (
          <Card>
            <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="Nada registrado neste filtro"
              description="As mudanças de configuração aparecem aqui assim que alguém salvar." />
          </Card>
        ) : (
          <Card flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-4 py-3 font-medium text-ink-3">Quando</th>
                    <th className="px-3 py-3 font-medium text-ink-3">Quem</th>
                    <th className="px-3 py-3 font-medium text-ink-3">O quê</th>
                    <th className="px-3 py-3 font-medium text-ink-3">Antes → depois</th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((ev) => {
                    const difs = diferencas(ev.antes, ev.depois)
                    const quem = ev.impersonado_por ? 'Equipe Nexus' : ev.usuario_id ? (nome.get(ev.usuario_id) ?? 'Pessoa fora da equipe') : 'Sistema'
                    return (
                      <tr key={ev.id} className="border-b border-line/60 align-top last:border-0">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-ink-2">{formatarDataHora(ev.criado_em, undefined, '', fuso)}</td>
                        <td className="px-3 py-3 text-ink">
                          {quem}
                          {ev.impersonado_por && <Badge tone="warn" className="ml-2">plataforma</Badge>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-ink">{rotuloEntidade(ev.entidade)} · {rotuloAcao(ev.acao)}</div>
                          {ev.entidade_id && <div className="font-mono text-[12px] text-ink-3">{ev.entidade_id}</div>}
                          {ev.motivo && <div className="mt-1 text-[12px] text-ink-2">Motivo: {ev.motivo}</div>}
                        </td>
                        <td className="px-3 py-3">
                          {difs.length === 0 ? <span className="text-ink-3">—</span> : (
                            <details>
                              <summary className="cursor-pointer text-ink-2">{difs.length === 1 ? '1 campo' : `${difs.length} campos`}</summary>
                              <dl className="mt-2 space-y-1">
                                {difs.map((d) => (
                                  <div key={d.campo} className="grid grid-cols-[110px_1fr] gap-2">
                                    <dt className="text-ink-3">{d.campo}</dt>
                                    <dd className="break-all font-mono text-[12px]">
                                      <span className="text-ink-3 line-through">{d.antes}</span>
                                      <span className="px-1 text-ink-3">→</span>
                                      <span className="text-ink">{d.depois}</span>
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </details>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {paginas > 1 && (
          <nav className="flex items-center justify-between text-[13px] text-ink-2">
            <span>{total} registros · página {filtro.pagina} de {paginas}</span>
            <span className="flex gap-3">
              {filtro.pagina > 1 && <Link href={link(filtro.pagina - 1)} className="hover:text-ink">Anterior</Link>}
              {filtro.pagina < paginas && <Link href={link(filtro.pagina + 1)} className="hover:text-ink">Próxima</Link>}
            </span>
          </nav>
        )}
      </div>
    </main>
  )
}
