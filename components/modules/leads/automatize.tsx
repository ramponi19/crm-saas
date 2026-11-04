'use client'

/**
 * AUTOMATIZE NO FUNIL (04/11/2026).
 *
 * Com o modo ligado, o quadro mostra embaixo de cada etapa o que ela faz sozinha:
 * as automações de "entrou na etapa" e as cadências que começam nela, com o
 * ligar/desligar, quantos negócios estão na fila (ou inscritos) e quantos
 * executaram hoje. O dono/admin cria automação a partir da etapa e pode pausar
 * todas de uma vez; o vendedor vê e não edita (a RLS também barra).
 */
import { useCallback, useEffect, useState } from 'react'
import { Bot, Pause, Play, Plus, Workflow } from 'lucide-react'
import { Button, Input, Modal, Select, notify } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface AutoDaEtapa {
  id: number; acao: string; ativo: boolean; espera_dias: number; modelo_id: number | null
  config: Record<string, unknown> | null; na_fila: number; executadas_hoje: number
}
export interface CadDaEtapa { id: number; nome: string; ativo: boolean; inscritos: number; executadas_hoje: number }
export interface DadosAutomatize {
  podeEditar: boolean
  pausado: boolean
  etapas: { id: number; slug: string; label: string; automacoes: AutoDaEtapa[]; cadencias: CadDaEtapa[] }[]
  modelos: { id: number; nome: string; idioma: string; corpo: string | null }[]
  equipe: { id: string; nome: string }[]
}

const ROTULO: Record<string, string> = {
  criar_tarefa: 'Criar tarefa',
  notificar_gestor: 'Avisar o gestor',
  enviar_modelo: 'Enviar modelo aprovado',
  atribuir_responsavel: 'Passar para',
  enviar_whatsapp_template: 'Tarefa de WhatsApp',
}

function frase(a: AutoDaEtapa, d: DadosAutomatize): string {
  const quando = a.espera_dias > 0 ? `Depois de ${a.espera_dias} dia${a.espera_dias > 1 ? 's' : ''}: ` : 'Na hora: '
  const c = a.config ?? {}
  if (a.acao === 'enviar_modelo') return quando + `enviar "${d.modelos.find((m) => m.id === a.modelo_id)?.nome ?? 'modelo'}"`
  if (a.acao === 'atribuir_responsavel') return quando + `passar para ${d.equipe.find((u) => u.id === c.responsavel_id)?.nome ?? '—'}`
  if (a.acao === 'criar_tarefa' || a.acao === 'notificar_gestor') return quando + `${ROTULO[a.acao].toLowerCase()} "${String(c.titulo ?? '')}"`
  return quando + (ROTULO[a.acao] ?? a.acao).toLowerCase()
}

/** Busca e mantém os dados do modo (só quando ligado). */
export function useAutomatize(funilId: number | undefined, ligado: boolean) {
  const [dados, setDados] = useState<DadosAutomatize | null>(null)
  const recarregar = useCallback(async () => {
    const r = await fetch(`/api/automatize${funilId ? `?funil=${funilId}` : ''}`)
    const j = await r.json().catch(() => null)
    if (r.ok && j) setDados(j as DadosAutomatize)
    else notify.bad('Não deu para carregar o Automatize', j?.error)
  }, [funilId])
  // Carregar ao ligar o modo: o setState acontece depois do fetch (assíncrono), não
  // durante o efeito — é a busca de dados que a regra não distingue.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (ligado) void recarregar() }, [ligado, recarregar])
  return { dados, recarregar }
}

async function postar(corpo: Record<string, unknown>): Promise<boolean> {
  const r = await fetch('/api/automatize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { notify.bad('Não foi possível gravar', (j as { error?: string }).error); return false }
  return true
}

/** Faixa no topo do quadro: resumo + "pausar todas" (dono/admin). */
export function AutomatizeBarra({ dados, recarregar }: { dados: DadosAutomatize | null; recarregar: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false)
  if (!dados) return <div className="mx-6 mb-2 text-[12px] text-ink-3">Carregando automações…</div>
  const ligadas = dados.etapas.reduce((s, e) => s + e.automacoes.filter((a) => a.ativo).length + e.cadencias.filter((c) => c.ativo).length, 0)
  const hoje = dados.etapas.reduce((s, e) => s + e.automacoes.reduce((x, a) => x + a.executadas_hoje, 0) + e.cadencias.reduce((x, c) => x + c.executadas_hoje, 0), 0)
  return (
    <div data-automatize-barra className={cn('mx-6 mb-2 flex flex-wrap items-center gap-3 rounded-card border px-3 py-2 text-[12.5px]',
      dados.pausado ? 'border-warn/40 bg-warn-soft text-warn' : 'border-line bg-card text-ink-2')}>
      <Workflow size={15} strokeWidth={1.7} />
      <span className="font-semibold">{dados.pausado ? 'Automações pausadas' : 'Automatize'}</span>
      <span className="text-ink-3">{ligadas} ligada{ligadas === 1 ? '' : 's'} · {hoje} executada{hoje === 1 ? '' : 's'} hoje</span>
      {!dados.podeEditar && <span className="text-ink-3">· só o dono ou um admin altera</span>}
      {dados.podeEditar && (
        <Button size="sm" variant={dados.pausado ? 'primary' : 'outline'} className="ml-auto" loading={ocupado}
          icon={dados.pausado ? <Play size={13} strokeWidth={1.8} /> : <Pause size={13} strokeWidth={1.8} />}
          onClick={async () => { setOcupado(true); if (await postar({ op: 'pausar', pausado: !dados.pausado })) await recarregar(); setOcupado(false) }}>
          {dados.pausado ? 'Retomar automações' : 'Pausar todas as automações'}
        </Button>
      )}
    </div>
  )
}

/** Embaixo de cada etapa: o que ela faz sozinha. */
export function AutomatizeEtapa({ slug, label, dados, recarregar }: { slug: string; label: string; dados: DadosAutomatize; recarregar: () => Promise<void> }) {
  const e = dados.etapas.find((x) => x.slug === slug)
  const [criando, setCriando] = useState(false)
  const autos = e?.automacoes ?? []
  const cads = e?.cadencias ?? []
  return (
    <div data-automatize-etapa={slug} className="mt-2 flex-none space-y-1.5 rounded-card border border-dashed border-line bg-card/60 p-2">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        <Bot size={12} strokeWidth={1.8} /> Automações
      </div>
      {autos.length === 0 && cads.length === 0 && <p className="text-[11.5px] text-ink-3">Nada automático nesta etapa.</p>}
      {autos.map((a) => (
        <Item key={`a${a.id}`} tipo="automacao" id={a.id} ativo={a.ativo} pode={dados.podeEditar} recarregar={recarregar}
          titulo={frase(a, dados)} numeros={`${a.na_fila} na fila · ${a.executadas_hoje} hoje`} />
      ))}
      {cads.map((c) => (
        <Item key={`c${c.id}`} tipo="cadencia" id={c.id} ativo={c.ativo} pode={dados.podeEditar} recarregar={recarregar}
          titulo={`Cadência: ${c.nome}`} numeros={`${c.inscritos} inscrito${c.inscritos === 1 ? '' : 's'} · ${c.executadas_hoje} hoje`} />
      ))}
      {dados.podeEditar && (
        <button type="button" onClick={() => setCriando(true)}
          className="flex w-full items-center justify-center gap-1 rounded-control border border-line bg-card px-2 py-1 text-[11.5px] font-medium text-ink-2 hover:text-ink">
          <Plus size={12} strokeWidth={1.8} /> Automação
        </button>
      )}
      {criando && <NovaAutomacao slug={slug} label={label} dados={dados} onFechar={() => setCriando(false)} onCriou={async () => { setCriando(false); await recarregar() }} />}
    </div>
  )
}

function Item({ tipo, id, ativo, pode, titulo, numeros, recarregar }: {
  tipo: 'automacao' | 'cadencia'; id: number; ativo: boolean; pode: boolean; titulo: string; numeros: string; recarregar: () => Promise<void>
}) {
  const [ocupado, setOcupado] = useState(false)
  return (
    <div data-automatize-item={`${tipo}-${id}`} className={cn('rounded-control border border-line-soft bg-card px-2 py-1.5', !ativo && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-ink">{titulo}</p>
        <button type="button" role="switch" aria-checked={ativo} aria-label={ativo ? 'Desligar' : 'Ligar'} disabled={!pode || ocupado}
          onClick={async () => { setOcupado(true); if (await postar({ op: 'ligar', tipo, id, ativo: !ativo })) await recarregar(); setOcupado(false) }}
          className={cn('relative mt-0.5 h-4 w-7 flex-none rounded-full transition-colors disabled:cursor-not-allowed',
            ativo ? 'bg-accent' : 'bg-ink/20')}>
          <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', ativo ? 'left-3.5' : 'left-0.5')} />
        </button>
      </div>
      <p className="num mt-0.5 text-[10.5px] text-ink-3">{numeros}</p>
    </div>
  )
}

function NovaAutomacao({ slug, label, dados, onFechar, onCriou }: {
  slug: string; label: string; dados: DadosAutomatize; onFechar: () => void; onCriou: () => Promise<void>
}) {
  const [acao, setAcao] = useState('criar_tarefa')
  const [espera, setEspera] = useState('0')
  const [titulo, setTitulo] = useState('')
  const [prazo, setPrazo] = useState('0')
  const [modelo, setModelo] = useState('')
  const [parametros, setParametros] = useState('')
  const [resp, setResp] = useState('')
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true)
    const ok = await postar({
      op: 'criar', etapa_id: dados.etapas.find((x) => x.slug === slug)?.id, etapa_slug: slug, acao, espera_dias: Number(espera) || 0, titulo, prazo_dias: Number(prazo) || 0,
      modelo_id: Number(modelo) || null, parametros: parametros ? parametros.split('|').map((p) => p.trim()) : [], responsavel_id: resp,
    })
    setSalvando(false)
    if (ok) { notify.ok('Automação criada'); await onCriou() }
  }
  return (
    <Modal open onClose={onFechar} title={`Nova automação · ${label}`} size="sm">
      <div className="space-y-3">
        <p className="text-[12px] text-ink-3">Quando um negócio <b>entrar em {label}</b>:</p>
        <Select label="Esperar" value={espera} onChange={(e) => setEspera(e.target.value)}>
          {[0, 1, 2, 3, 5, 7, 15, 30].map((n) => <option key={n} value={n}>{n === 0 ? 'Na hora' : `${n} dia${n > 1 ? 's' : ''}`}</option>)}
        </Select>
        <Select label="E então" value={acao} onChange={(e) => setAcao(e.target.value)}>
          <option value="criar_tarefa">Criar tarefa para o responsável</option>
          <option value="notificar_gestor">Avisar o gestor (tarefa)</option>
          <option value="atribuir_responsavel">Passar o negócio para…</option>
          <option value="enviar_modelo" disabled={!dados.modelos.length}>Enviar modelo aprovado pelo WhatsApp{dados.modelos.length ? '' : ' (nenhum aprovado)'}</option>
        </Select>
        {(acao === 'criar_tarefa' || acao === 'notificar_gestor') && (
          <>
            <Input label="Título da tarefa" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ligar para {{nome}}" />
            {acao === 'criar_tarefa' && <Input label="Prazo (dias)" type="number" value={prazo} onChange={(e) => setPrazo(e.target.value)} />}
          </>
        )}
        {acao === 'atribuir_responsavel' && (
          <Select label="Responsável" value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">— escolha —</option>
            {dados.equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </Select>
        )}
        {acao === 'enviar_modelo' && (
          <>
            <Select label="Modelo aprovado" value={modelo} onChange={(e) => setModelo(e.target.value)}>
              <option value="">— escolha —</option>
              {dados.modelos.map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.idioma})</option>)}
            </Select>
            <Input label="Variáveis ({{1}}|{{2}}…; use {{nome}})" value={parametros} onChange={(e) => setParametros(e.target.value)} placeholder="{{nome}}" />
            <p className="text-[11px] leading-snug text-ink-3">
              Vai de verdade para o cliente, no horário de atendimento, no máximo 1 vez por modelo a cada 7 dias e até 50 por hora na empresa. Quem pediu para não receber não recebe.
            </p>
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button loading={salvando} onClick={salvar}>Criar automação</Button>
        </div>
      </div>
    </Modal>
  )
}
