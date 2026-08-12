'use client'

import { useRouter } from 'next/navigation'
import { Clock, LogIn } from 'lucide-react'
import { Card, Table, Badge, Select, EmptyState, type Column } from '@/components/ui'

export interface SessaoAcesso {
  id: number
  usuario: string
  entrada: string
  fim: string
  minutos: number
  aberta: boolean
  comoTerminou: 'aberta' | 'saiu' | 'fechou a aba' | 'parou de usar'
}

export interface ResumoUsuario {
  nome: string
  papel: string
  ultimoAcesso: string | null
  sessoes: number
  minutos: number
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** 95 min → "1h35". Minuto cru fica ilegível a partir de duas horas. */
function duracao(min: number): string {
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

function desdeQuando(iso: string | null): string {
  if (!iso) return 'nunca entrou'
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

/**
 * Uso da equipe: quem entrou, quando, e por quanto tempo ficou.
 *
 * A pergunta que essa tela responde é "meus funcionários estão usando o CRM?",
 * então o RESUMO vem primeiro — a lista de sessões é para conferir um caso
 * específico, não para ler todo dia.
 */
export function AcessosView({ sessoes, resumo, dias }: {
  sessoes: SessaoAcesso[]; resumo: ResumoUsuario[]; dias: number
}) {
  const router = useRouter()

  const cols: Column<SessaoAcesso>[] = [
    { key: 'usuario', header: 'Usuário', render: (s) => <span className="font-medium text-ink">{s.usuario}</span> },
    {
      key: 'entrada', header: 'Entrada', className: 'num',
      render: (s) => <span className="text-ink-2">{dia(s.entrada)} · {hora(s.entrada)}</span>,
    },
    {
      key: 'saida', header: 'Saída', className: 'num',
      render: (s) => s.aberta
        ? <Badge tone="ok" dot>agora</Badge>
        : <span className="text-ink-2">{dia(s.fim)} · {hora(s.fim)}</span>,
    },
    {
      key: 'tempo', header: 'Tempo', align: 'right', className: 'num',
      render: (s) => <span className="font-semibold text-ink">{duracao(s.minutos)}</span>,
    },
    {
      key: 'como', header: 'Encerrou', hideOnMobile: true,
      render: (s) => <span className="text-[11.5px] text-ink-3">{s.comoTerminou}</span>,
    },
  ]

  const colsResumo: Column<ResumoUsuario>[] = [
    { key: 'nome', header: 'Usuário', render: (u) => <span className="font-medium text-ink">{u.nome}</span> },
    { key: 'papel', header: 'Papel', hideOnMobile: true, render: (u) => <Badge tone="neutro">{u.papel || '—'}</Badge> },
    {
      key: 'ultimo', header: 'Último acesso',
      render: (u) => (
        <span className={u.ultimoAcesso ? 'text-ink-2' : 'font-medium text-warn'}>{desdeQuando(u.ultimoAcesso)}</span>
      ),
    },
    { key: 'sessoes', header: 'Acessos', align: 'right', className: 'num', render: (u) => <span className="text-ink-2">{u.sessoes}</span> },
    {
      key: 'tempo', header: 'Tempo total', align: 'right', className: 'num',
      render: (u) => <span className="font-semibold text-ink">{u.minutos ? duracao(u.minutos) : '—'}</span>,
    },
  ]

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto w-full max-w-[900px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-[18px] font-semibold text-ink">
              <Clock size={18} strokeWidth={1.8} className="text-accent" /> Uso da equipe
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-3">Quem entrou no CRM, quando e por quanto tempo ficou.</p>
          </div>
          <Select wrapperClassName="w-[170px]" label="Período" value={String(dias)}
            onChange={(e) => router.push(`/admin/acessos?dias=${e.target.value}`)}>
            <option value="7">Últimos 7 dias</option>
            <option value="14">Últimos 14 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </Select>
        </div>

        <Card flush title="Resumo por pessoa">
          <Table columns={colsResumo} rows={resumo} rowKey={(u) => u.nome}
            empty={<EmptyState icon={<LogIn size={22} strokeWidth={1.7} />} title="Nenhum usuário ativo" description="Cadastre a equipe em Equipe." />} />
        </Card>

        <Card flush title={`Acessos (${sessoes.length})`}>
          <Table columns={cols} rows={sessoes} rowKey={(s) => s.id}
            empty={<EmptyState
              icon={<Clock size={22} strokeWidth={1.7} />}
              title="Nenhum acesso registrado no período"
              description="O registro começa a partir de agora: acesso anterior a esta tela não foi gravado." />} />
        </Card>

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          <strong className="text-ink-2">Como o tempo é medido.</strong> O CRM manda um sinal a cada 5 minutos —
          só enquanto a aba está à frente e há alguém mexendo, para que aba esquecida aberta não vire hora
          trabalhada. Quem clica em <strong className="text-ink-2">Sair</strong> tem a hora exata; quem fecha a aba
          ou para de usar tem como saída o último sinal — por isso a coluna “Encerrou”. Recarregar a página ou
          abrir outra aba não cria acesso novo: sinal recente é entendido como a mesma sessão.
        </p>
      </div>
    </main>
  )
}
