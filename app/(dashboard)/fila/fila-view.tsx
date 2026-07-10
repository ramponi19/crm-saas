'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Button, Select, Input, Badge, EmptyState, notify } from '@/components/ui'
import { Phone, MessageCircle, Mail, CheckSquare, PhoneCall, ExternalLink, Clock, LogOut, CheckCircle2 } from 'lucide-react'

export interface ItemFila {
  inscricaoId: number
  leadId: number
  leadNome: string
  telefone: string | null
  etapa: string | null
  cadencia: string
  passoOrdem: number
  canal: string
  instrucao: string
  templateChave: string | null
  venceEm: string | null
}

const CANAL: Record<string, { label: string; Icon: typeof Phone }> = {
  ligacao: { label: 'Ligação', Icon: Phone },
  whatsapp: { label: 'WhatsApp', Icon: MessageCircle },
  email: { label: 'E-mail', Icon: Mail },
  tarefa: { label: 'Tarefa', Icon: CheckSquare },
}

const soDigitos = (t: string | null) => (t || '').replace(/\D/g, '')
function waLink(tel: string | null, msg: string) {
  let d = soDigitos(tel)
  if (d && d.length <= 11 && !d.startsWith('55')) d = '55' + d
  return `https://wa.me/${d}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`
}
const atrasada = (iso: string | null) => {
  if (!iso) return false
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  return new Date(iso) < hoje
}

export function FilaView({ itens: iniciais, templates }: { itens: ItemFila[]; templates: Record<string, string> }) {
  const [itens, setItens] = useState<ItemFila[]>(iniciais)
  const [feitas, setFeitas] = useState(0)
  const [resultado, setResultado] = useState('atendeu')
  const [obs, setObs] = useState('')
  const [busy, setBusy] = useState(false)

  const total = feitas + itens.length
  const atual = itens[0]

  async function agir(tipo: 'executar' | 'adiar' | 'sair', res?: string) {
    if (!atual || busy) return
    setBusy(true)
    const r = await fetch('/api/cadencias/acao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inscricaoId: atual.inscricaoId, tipo, resultado: res, observacao: obs, canal: atual.canal }),
    })
    setBusy(false)
    if (!r.ok) { notify.bad('Não foi possível registrar'); return }
    if (tipo === 'executar') setFeitas((f) => f + 1)
    if (tipo === 'adiar') notify.ok('Adiado para amanhã')
    if (tipo === 'sair') notify.ok('Lead saiu da cadência')
    setObs(''); setResultado('atendeu')
    setItens((prev) => prev.slice(1))
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Fila do dia" />
      <div className="mx-auto w-full max-w-[640px] flex-1 overflow-y-auto p-4 scrollbar-thin">
        {/* Progresso */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-[17px] font-semibold text-ink">Fila do dia</h1>
            <p className="text-[13px] text-ink-3">
              {itens.length > 0 ? `${itens.length} ${itens.length === 1 ? 'ação pendente' : 'ações pendentes'}` : 'Tudo em dia'}
            </p>
          </div>
          {total > 0 && (
            <div className="text-right">
              <div className="num text-[15px] font-semibold text-ink">{feitas}/{total}</div>
              <div className="text-[11px] text-ink-3">concluídas</div>
            </div>
          )}
        </div>
        {total > 0 && (
          <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${total ? (feitas / total) * 100 : 0}%` }} />
          </div>
        )}

        {!atual ? (
          <div className="pt-10">
            <EmptyState
              icon={<CheckCircle2 size={26} strokeWidth={1.6} />}
              title={feitas > 0 ? 'Fila zerada!' : 'Nenhuma ação pendente'}
              description={feitas > 0 ? `Você concluiu ${feitas} ${feitas === 1 ? 'ação' : 'ações'} hoje. Bom trabalho.` : 'Quando um lead entrar numa cadência, as ações do dia aparecem aqui.'}
            />
          </div>
        ) : (
          <FilaCard
            item={atual}
            templates={templates}
            resultado={resultado} setResultado={setResultado}
            obs={obs} setObs={setObs}
            busy={busy} agir={agir}
          />
        )}
      </div>
    </div>
  )
}

function FilaCard({ item, templates, resultado, setResultado, obs, setObs, busy, agir }: {
  item: ItemFila
  templates: Record<string, string>
  resultado: string; setResultado: (v: string) => void
  obs: string; setObs: (v: string) => void
  busy: boolean; agir: (tipo: 'executar' | 'adiar' | 'sair', res?: string) => void
}) {
  const c = CANAL[item.canal] ?? CANAL.ligacao
  const late = atrasada(item.venceEm)
  const msg = item.templateChave ? (templates[item.templateChave] ?? '').replace(/\{\{nome\}\}/g, item.leadNome) : ''

  return (
    <div className="rounded-card border border-line bg-card p-5">
      {/* Cabeçalho do lead */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold text-ink">{item.leadNome}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
            <span>{item.cadencia}</span>
            <span>·</span>
            <span>Passo {item.passoOrdem}</span>
            {item.etapa && <Badge tone="neutro" className="shrink-0">{item.etapa}</Badge>}
          </div>
        </div>
        <Badge tone={late ? 'bad' : 'neutro'} className="shrink-0">
          <Clock size={11} strokeWidth={1.9} className="mr-1 inline" />{late ? 'Atrasada' : 'Hoje'}
        </Badge>
      </div>

      {/* Ação sugerida */}
      <div className="mt-4 flex items-start gap-3 rounded-control border border-line-soft bg-bg p-3.5">
        <div className="flex size-9 flex-none items-center justify-center rounded-full bg-accent/10 text-accent">
          <c.Icon size={17} strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{c.label}</div>
          <div className="text-[14px] text-ink">{item.instrucao}</div>
        </div>
      </div>

      {/* Execução por canal */}
      <div className="mt-4 space-y-3">
        {item.canal === 'ligacao' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <a href={item.telefone ? `tel:${soDigitos(item.telefone)}` : undefined} className={!item.telefone ? 'pointer-events-none opacity-50' : ''}>
                <Button variant="outline" className="w-full" icon={<PhoneCall size={15} strokeWidth={1.8} />}>Ligar</Button>
              </a>
              <Select value={resultado} onChange={(e) => setResultado(e.target.value)}>
                <option value="atendeu">Atendeu</option>
                <option value="sem_resposta">Não atendeu</option>
                <option value="caixa_postal">Caixa postal</option>
                <option value="converteu">Converteu</option>
              </Select>
            </div>
            <Input placeholder="Resumo da conversa (opcional)…" value={obs} onChange={(e) => setObs(e.target.value)} />
            <Button className="w-full" loading={busy} onClick={() => agir('executar', resultado)}>Registrar e avançar</Button>
          </>
        )}

        {item.canal === 'whatsapp' && (
          <>
            <a href={item.telefone ? waLink(item.telefone, msg) : undefined} target="_blank" rel="noopener noreferrer"
              className={!item.telefone ? 'pointer-events-none opacity-50' : ''}>
              <Button variant="outline" className="w-full" icon={<ExternalLink size={15} strokeWidth={1.8} />}>Abrir WhatsApp</Button>
            </a>
            {msg && <div className="rounded-control border border-line-soft bg-bg p-2.5 text-[12px] text-ink-2">{msg}</div>}
            <Input placeholder="Observação (opcional)…" value={obs} onChange={(e) => setObs(e.target.value)} />
            <Button className="w-full" loading={busy} onClick={() => agir('executar', 'feito')}>Registrar enviado e avançar</Button>
          </>
        )}

        {(item.canal === 'email' || item.canal === 'tarefa') && (
          <>
            <Input placeholder="Observação (opcional)…" value={obs} onChange={(e) => setObs(e.target.value)} />
            <Button className="w-full" loading={busy} onClick={() => agir('executar', 'feito')}>Concluir e avançar</Button>
          </>
        )}
      </div>

      {/* Ações secundárias */}
      <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3 text-[12.5px]">
        <button type="button" disabled={busy} onClick={() => agir('adiar')} className="flex items-center gap-1.5 font-medium text-ink-2 transition-colors hover:text-ink disabled:opacity-50">
          <Clock size={13} strokeWidth={1.8} /> Adiar p/ amanhã
        </button>
        <button type="button" disabled={busy} onClick={() => agir('sair')} className="flex items-center gap-1.5 font-medium text-ink-3 transition-colors hover:text-bad disabled:opacity-50">
          <LogOut size={13} strokeWidth={1.8} /> Sair da cadência
        </button>
      </div>
    </div>
  )
}
