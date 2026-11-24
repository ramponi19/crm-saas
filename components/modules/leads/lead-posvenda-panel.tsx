'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { HeartHandshake, Loader2, Check, Circle, X } from 'lucide-react'
import { Badge, Button, Input, Select, Textarea, notify } from '@/components/ui'
import { cn } from '@/lib/utils'

interface Passo {
  id: number; desteNegocio: boolean; passo: string; regua: string | null; dia: string; status: string
  resultado: string | null; feitoEm: string | null; responsavel: string | null; tentativas: number
}
interface Nota { id: number; nota: number; comentario: string | null; dia: string }
interface Chamado { id: number; numero: number; titulo: string; prioridade: string; status: string; resolvido: boolean; aberto: string; atrasado: boolean }
interface Dados { hoje: string; contatoId: number; categorias: { id: number; nome: string }[]; passos: Passo[]; notas: Nota[]; chamados: Chamado[] }

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
  const [form, setForm] = useState<'nota' | 'chamado' | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/pos-venda/lead/${leadId}`)
      if (!r.ok) { setEstado('oculto'); return }
      setDados(await r.json()); setEstado('ok')
    } catch { setEstado('oculto') }
  }, [leadId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- a primeira leitura do painel; o estado vem da rota
  useEffect(() => { carregar() }, [carregar])

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
          {form === 'nota' ? <FormNota leadId={leadId} aoFechar={(ok) => { setForm(null); if (ok) carregar() }} />
            : form === 'chamado' ? <FormChamado leadId={leadId} contatoId={dados.contatoId} categorias={dados.categorias} aoFechar={(ok) => { setForm(null); if (ok) carregar() }} />
            : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setForm('nota')}>Registrar nota</Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setForm('chamado')}>Abrir chamado</Button>
              </div>
            )}
          <div className="flex gap-3">
            <Link href="/pos-venda" className="text-[12px] font-medium text-ink-2 hover:text-ink">Fila do pós-venda</Link>
            <Link href="/pos-venda/chamados" className="text-[12px] font-medium text-ink-2 hover:text-ink">Chamados</Link>
          </div>
        </div>
      )}
    </div>
  )
}

/** Nota que o cliente deu fora da fila (balcão, ligação). Até o limite da empresa abre chamado. */
function FormNota({ leadId, aoFechar }: { leadId: number; aoFechar: (ok: boolean) => void }) {
  const [nota, setNota] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true)
    const r = await fetch('/api/pos-venda/nps', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ negocio_id: leadId, nota, comentario }) })
    const j = await r.json().catch(() => ({}))
    setSalvando(false)
    if (!r.ok) { notify.bad(j.error ?? 'Não foi possível registrar'); return }
    notify.ok('Nota registrada')
    if (j.resultado?.chamado_id) notify.ok('Nota baixa: chamado aberto para os administradores')
    aoFechar(true)
  }
  return (
    <div className="flex flex-col gap-2 rounded-control border border-line-soft bg-bg p-2.5">
      <div className="text-[12px] text-ink-2">Nota de 0 a 10 que o cliente deu</div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" onClick={() => setNota(n)}
            className={cn('num h-7 rounded-[6px] border text-[12px] font-medium', nota === n ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink')}>{n}</button>
        ))}
      </div>
      <Input placeholder="Comentário do cliente (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" loading={salvando} disabled={nota == null} onClick={salvar}>Salvar nota</Button><Button size="sm" variant="ghost" onClick={() => aoFechar(false)}>Cancelar</Button></div>
    </div>
  )
}

/** Chamado aberto pela equipe, já com o cliente e a venda deste card. Vai para os administradores. */
function FormChamado({ leadId, contatoId, categorias, aoFechar }: { leadId: number; contatoId: number; categorias: { id: number; nome: string }[]; aoFechar: (ok: boolean) => void }) {
  const [f, setF] = useState({ titulo: '', descricao: '', categoria_id: '', prioridade: 'normal' })
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true)
    const r = await fetch('/api/pos-venda/chamados', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'abrir', contato_id: contatoId, negocio_id: leadId, ...f, categoria_id: f.categoria_id || null }) })
    const j = await r.json().catch(() => ({}))
    setSalvando(false)
    if (!r.ok) { notify.bad(j.error ?? 'Não foi possível abrir o chamado'); return }
    notify.ok(`Chamado #${j.chamado?.numero ?? ''} aberto`)
    aoFechar(true)
  }
  return (
    <div className="flex flex-col gap-2 rounded-control border border-line-soft bg-bg p-2.5">
      <Input label="O que aconteceu" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <Select label="Categoria" value={f.categoria_id} onChange={(e) => setF({ ...f, categoria_id: e.target.value })}>
          <option value="">Sem categoria</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <Select label="Prioridade" value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value })}>
          <option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
        </Select>
      </div>
      <Textarea label="Detalhes (opcional)" rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
      <div className="flex gap-2"><Button size="sm" loading={salvando} disabled={f.titulo.trim().length < 3} onClick={salvar}>Abrir chamado</Button><Button size="sm" variant="ghost" onClick={() => aoFechar(false)}>Cancelar</Button></div>
    </div>
  )
}
