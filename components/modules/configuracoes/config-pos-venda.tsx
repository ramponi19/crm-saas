'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Pencil, Plus } from 'lucide-react'
import { Badge, Button, Input, Select, Textarea, Tabs, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import { montarMensagem, rotuloDoPasso } from '@/lib/posvenda/fila'
import {
  AVISO_SEM_MODELO, CATEGORIAS_MODELO, DIA_JANELA_PROVAVELMENTE_FECHADA, ROTULO_CATEGORIA, categoriasPermitidas, passoPrecisaDeModelo,
} from '@/lib/posvenda/config'

type Filtros = { categorias?: number[]; condicao?: string }
export interface DadosConfigPosVenda {
  reguas: { id: number; nome: string; ativo: boolean; prioridade: number; filtros: Filtros; ao_recomprar: string }[]
  passos: { id: number; cadencia_id: number; ordem: number; dia_offset: number; tipo_acao: string; titulo: string; roteiro: string | null
    grupo: string; ativo: boolean; responsavel: string; modelo_id: number | null; filtros: Filtros; tolerancia_dias: number }[]
  modelos: { id: number; nome: string; categoria: string; corpo: string; status: string }[]
  categorias: { id: number; nome: string }[]
  parametros: Record<string, { empresa: unknown; lojas: Record<string, unknown> }>
  lojas: { id: number; nome: string }[]
  equipe: { id: string; nome: string }[]
  categoriasChamado: { id: number; nome: string; ativo: boolean }[]
  sla: { prioridade: string; primeira_resposta_horas: number; resolucao_horas: number }[]
}

const TIPOS: Record<string, string> = { whatsapp: 'WhatsApp', ligacao: 'Ligação', pesquisa: 'Pesquisa (nota)', tarefa_interna: 'Tarefa interna' }
const EXEMPLO = { nome: 'Ana Souza', produto: 'o produto comprado', loja: 'a loja', vendedor: 'Carlos Lima' }

async function gravar(corpo: Record<string, unknown>): Promise<{ ok: boolean; id?: number }> {
  const r = await fetch('/api/pos-venda/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { notify.bad(j.error ?? 'Não foi possível salvar'); return { ok: false } }
  return { ok: true, id: j.id }
}

/** CONFIGURAÇÕES › PÓS-VENDA (C7 bloco 3). Réguas e passos, parâmetros e chamados. */
export function ConfigPosVenda({ dados }: { dados: DadosConfigPosVenda }) {
  const [aba, setAba] = useState<'reguas' | 'parametros' | 'chamados'>('reguas')
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Pós-venda</h1>
        <p className="mt-1 text-[13px] text-ink-2">Réguas de contato depois da venda, parâmetros e chamados. Mudanças valem para as vendas novas.</p>
      </header>
      <Tabs className="mb-4" value={aba} onValueChange={(v) => setAba(v as typeof aba)}
        items={[{ value: 'reguas', label: 'Réguas' }, { value: 'parametros', label: 'Parâmetros' }, { value: 'chamados', label: 'Chamados' }]} />
      {aba === 'reguas' && <Reguas dados={dados} />}
      {aba === 'parametros' && <Parametros dados={dados} />}
      {aba === 'chamados' && <Chamados dados={dados} />}
    </div>
  )
}

// ── Réguas ─────────────────────────────────────────────────────────────────────────────────────
function Reguas({ dados }: { dados: DadosConfigPosVenda }) {
  const [nova, setNova] = useState(false)
  const permitidas = categoriasPermitidas(dados.parametros.categorias_modelo?.empresa)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-ink-3">
        Cada venda segue a régua da categoria dela (a de maior prioridade); sem régua da categoria, a régua geral (sem categorias).
        O roteiro vale com a janela de 24 h aberta; com a janela fechada, só o modelo aprovado pela Meta.
        Modelos liberados para o pós-venda: <strong className="text-ink-2">{permitidas.map((c) => ROTULO_CATEGORIA[c]).join(' e ')}</strong> (aba Parâmetros).
      </p>
      {dados.reguas.map((r) => <Regua key={r.id} regua={r} dados={dados} />)}
      {nova ? <FormRegua dados={dados} aoFechar={() => setNova(false)} /> : (
        <Button variant="outline" className="self-start" icon={<Plus size={15} strokeWidth={1.8} />} onClick={() => setNova(true)}>Nova régua</Button>
      )}
    </div>
  )
}

function Regua({ regua, dados }: { regua: DadosConfigPosVenda['reguas'][number]; dados: DadosConfigPosVenda }) {
  const [editando, setEditando] = useState(false)
  const [novoPasso, setNovoPasso] = useState(false)
  const passos = dados.passos.filter((p) => p.cadencia_id === regua.id).sort((a, b) => a.dia_offset - b.dia_offset || a.ordem - b.ordem)
  const cats = (regua.filtros.categorias ?? []).map((id) => dados.categorias.find((c) => c.id === id)?.nome ?? `#${id}`)
  const semModelo = passos.filter(passoPrecisaDeModelo).length
  return (
    <section className={cn('rounded-card border border-line bg-card', !regua.ativo && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3 border-b border-line-soft px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-semibold text-ink">{regua.nome}</span>
            {!regua.ativo && <Badge>Inativa</Badge>}
            {semModelo > 0 && <Badge tone="warn">{semModelo} sem modelo</Badge>}
          </div>
          <div className="mt-0.5 text-[12px] text-ink-3">
            {cats.length ? cats.join(', ') : 'Geral (toda venda sem régua da categoria)'}
            {regua.filtros.condicao ? ` · só ${regua.filtros.condicao === 'seminovo' ? 'usado' : 'novo'}` : ''} · prioridade {regua.prioridade}
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<Pencil size={13} strokeWidth={1.8} />} onClick={() => setEditando((v) => !v)}>Editar</Button>
      </div>
      {editando && <div className="border-b border-line-soft px-4 py-3"><FormRegua dados={dados} regua={regua} aoFechar={() => setEditando(false)} /></div>}
      <ol className="divide-y divide-line-soft">
        {passos.map((p) => <Passo key={p.id} passo={p} dados={dados} />)}
      </ol>
      <div className="px-4 py-3">
        {novoPasso ? (
          <FormPasso dados={dados} cadenciaId={regua.id} ordem={Math.max(0, ...passos.map((p) => p.ordem)) + 1} aoFechar={() => setNovoPasso(false)} />
        ) : (
          <Button variant="outline" size="sm" icon={<Plus size={14} strokeWidth={1.8} />} onClick={() => setNovoPasso(true)}>Novo passo</Button>
        )}
      </div>
    </section>
  )
}

function Passo({ passo, dados }: { passo: DadosConfigPosVenda['passos'][number]; dados: DadosConfigPosVenda }) {
  const [editando, setEditando] = useState(false)
  const modelo = dados.modelos.find((m) => m.id === passo.modelo_id)
  const precisa = passoPrecisaDeModelo(passo)
  return (
    <li className={cn('px-4 py-2.5', !passo.ativo && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] text-ink">
            <span className="font-medium">{rotuloDoPasso(passo.dia_offset, passo.titulo)}</span>
            <span className="text-ink-3"> · {TIPOS[passo.tipo_acao] ?? passo.tipo_acao}{passo.filtros.condicao ? ` · só ${passo.filtros.condicao === 'seminovo' ? 'usado' : 'novo'}` : ''}{!passo.ativo ? ' · desligado' : ''}</span>
          </div>
          {modelo ? (
            <div className="text-[12px] text-ink-3">Janela fechada: modelo <span className="text-ink-2">{modelo.nome}</span> <Badge tone={modelo.categoria === 'MARKETING' ? 'warn' : 'acc'}>{ROTULO_CATEGORIA[modelo.categoria] ?? modelo.categoria}</Badge></div>
          ) : precisa ? (
            <div className="flex items-center gap-1 text-[12px] text-warn" data-aviso-sem-modelo><AlertTriangle size={12} strokeWidth={1.9} /> {AVISO_SEM_MODELO}</div>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditando((v) => !v)}>{editando ? 'Fechar' : 'Editar'}</Button>
      </div>
      {editando && <div className="mt-2"><FormPasso dados={dados} cadenciaId={passo.cadencia_id} passo={passo} ordem={passo.ordem} aoFechar={() => setEditando(false)} /></div>}
    </li>
  )
}

function FormRegua({ dados, regua, aoFechar }: { dados: DadosConfigPosVenda; regua?: DadosConfigPosVenda['reguas'][number]; aoFechar: () => void }) {
  const router = useRouter()
  const [f, setF] = useState({
    nome: regua?.nome ?? '', prioridade: String(regua?.prioridade ?? 0), ativo: regua?.ativo ?? true,
    categorias: regua?.filtros.categorias ?? [], condicao: regua?.filtros.condicao ?? '', ao_recomprar: regua?.ao_recomprar ?? 'reiniciar',
  })
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true)
    const r = await gravar({ acao: 'regua', id: regua?.id, ...f, prioridade: Number(f.prioridade), condicao: f.condicao || null })
    setSalvando(false)
    if (r.ok) { notify.ok('Régua salva'); aoFechar(); router.refresh() }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Input label="Nome da régua" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <Input label="Prioridade" type="number" value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value })} />
      </div>
      <div>
        <div className="mb-1 text-[12px] font-medium text-ink-2">Categorias da venda (nenhuma = régua geral)</div>
        <div className="flex flex-wrap gap-1.5">
          {dados.categorias.map((c) => {
            const on = f.categorias.includes(c.id)
            return (
              <button key={c.id} type="button" onClick={() => setF({ ...f, categorias: on ? f.categorias.filter((x) => x !== c.id) : [...f.categorias, c.id] })}
                className={cn('rounded-[6px] border px-2 py-1 text-[12px]', on ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2')}>{c.nome}</button>
            )
          })}
          {dados.categorias.length === 0 && <span className="text-[12px] text-ink-3">A empresa não tem categorias cadastradas.</span>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Condição da venda" value={f.condicao} onChange={(e) => setF({ ...f, condicao: e.target.value })}>
          <option value="">Qualquer</option><option value="novo">Só novo</option><option value="seminovo">Só usado</option>
        </Select>
        <Select label="Quando o cliente compra de novo" value={f.ao_recomprar} onChange={(e) => setF({ ...f, ao_recomprar: e.target.value })}>
          <option value="reiniciar">Começa a régua de novo</option><option value="manter">Mantém a régua atual</option><option value="encerrar">Encerra a régua</option>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Régua ativa</label>
      <div className="flex gap-2"><Button loading={salvando} onClick={salvar}>Salvar régua</Button><Button variant="ghost" onClick={aoFechar}>Cancelar</Button></div>
    </div>
  )
}

function FormPasso({ dados, cadenciaId, passo, ordem, aoFechar }: {
  dados: DadosConfigPosVenda; cadenciaId: number; passo?: DadosConfigPosVenda['passos'][number]; ordem: number; aoFechar: () => void
}) {
  const router = useRouter()
  const [f, setF] = useState({
    ordem: String(passo?.ordem ?? ordem), dia_offset: String(passo?.dia_offset ?? 1), tipo_acao: passo?.tipo_acao ?? 'whatsapp',
    titulo: passo?.titulo ?? '', roteiro: passo?.roteiro ?? '', grupo: passo?.grupo ?? 'relacionamento', ativo: passo?.ativo ?? true,
    responsavel: passo?.responsavel ?? 'acompanhamento', modelo_id: passo?.modelo_id ? String(passo.modelo_id) : '',
    condicao: passo?.filtros.condicao ?? '', tolerancia_dias: String(passo?.tolerancia_dias ?? 7),
  })
  const [salvando, setSalvando] = useState(false)
  const permitidas = categoriasPermitidas(dados.parametros.categorias_modelo?.empresa) as string[]
  const aprovados = dados.modelos.filter((m) => m.status === 'aprovado')
  const previa = useMemo(() => montarMensagem(f.roteiro, EXEMPLO), [f.roteiro])
  const precisa = passoPrecisaDeModelo({ tipo_acao: f.tipo_acao, dia_offset: Number(f.dia_offset) || 0, modelo_id: f.modelo_id ? 1 : null, ativo: f.ativo })
  const modeloEscolhido = aprovados.find((m) => String(m.id) === f.modelo_id)

  async function salvar() {
    setSalvando(true)
    const r = await gravar({ acao: 'passo', id: passo?.id, cadencia_id: cadenciaId, ...f, ordem: Number(f.ordem), dia_offset: Number(f.dia_offset),
      tolerancia_dias: Number(f.tolerancia_dias), modelo_id: f.modelo_id ? Number(f.modelo_id) : null, condicao: f.condicao || null })
    setSalvando(false)
    if (r.ok) { notify.ok('Passo salvo'); aoFechar(); router.refresh() }
  }
  return (
    <div className="flex flex-col gap-3 rounded-control border border-line-soft bg-bg p-3">
      <div className="grid grid-cols-3 gap-2">
        <Input label="Dia (D+)" type="number" value={f.dia_offset} onChange={(e) => setF({ ...f, dia_offset: e.target.value })} />
        <Select label="Tipo" value={f.tipo_acao} onChange={(e) => setF({ ...f, tipo_acao: e.target.value })}>
          {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Input label="Ordem" type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} />
      </div>
      <Input label="Título (o que aparece na fila)" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
      {f.tipo_acao !== 'tarefa_interna' && (
        <div>
          <Textarea label="Roteiro (mensagem com a janela de 24 h aberta)" rows={3} value={f.roteiro} onChange={(e) => setF({ ...f, roteiro: e.target.value })} />
          <p className="mt-1 text-[11.5px] text-ink-3">Variáveis: {'{{nome}}'} (primeiro nome), {'{{produto}}'}, {'{{loja}}'}, {'{{vendedor}}'}.</p>
          {previa && <div className="mt-1.5 rounded-control border border-line-soft bg-card p-2 text-[12.5px] text-ink-2"><span className="text-ink-3">Prévia: </span>{previa}</div>}
        </div>
      )}
      {(f.tipo_acao === 'whatsapp' || f.tipo_acao === 'pesquisa') && (
        <div>
          <Select label="Modelo para janela fechada" value={f.modelo_id} onChange={(e) => setF({ ...f, modelo_id: e.target.value })}>
            <option value="">Nenhum</option>
            {aprovados.map((m) => (
              <option key={m.id} value={m.id} disabled={!permitidas.includes(m.categoria)}>
                {m.nome} · {ROTULO_CATEGORIA[m.categoria] ?? m.categoria}{!permitidas.includes(m.categoria) ? ' (categoria não liberada)' : ''}
              </option>
            ))}
          </Select>
          {modeloEscolhido && <div className="mt-1.5 rounded-control border border-line-soft bg-card p-2 text-[12.5px] text-ink-2 whitespace-pre-line">{modeloEscolhido.corpo}</div>}
          {aprovados.length === 0 && <p className="mt-1 text-[11.5px] text-ink-3">Nenhum modelo aprovado ainda. Crie em <Link href="/modelos" className="underline">Automações › Modelos</Link>.</p>}
          {precisa && <p className="mt-1 flex items-center gap-1 text-[12px] text-warn"><AlertTriangle size={12} strokeWidth={1.9} /> {AVISO_SEM_MODELO}</p>}
          {!precisa && !f.modelo_id && Number(f.dia_offset) < DIA_JANELA_PROVAVELMENTE_FECHADA && (
            <p className="mt-1 text-[11.5px] text-ink-3">Até D+{DIA_JANELA_PROVAVELMENTE_FECHADA - 1} a janela costuma estar aberta; mesmo assim, um modelo evita o passo travado.</p>
          )}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <Select label="Grupo" value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })}>
          <option value="relacionamento">Relacionamento</option><option value="produto">Do produto (recompra cancela)</option>
        </Select>
        <Select label="Só para" value={f.condicao} onChange={(e) => setF({ ...f, condicao: e.target.value })}>
          <option value="">Novo e usado</option><option value="novo">Só novo</option><option value="seminovo">Só usado</option>
        </Select>
        <Select label="Responsável" value={f.responsavel.startsWith('usuario:') ? f.responsavel : f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })}>
          <option value="acompanhamento">Quem vendeu (regra padrão)</option>
          <option value="administradores">Administradores</option>
          {dados.equipe.map((p) => <option key={p.id} value={`usuario:${p.id}`}>{p.nome}</option>)}
        </Select>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input label="Tolerância (dias de atraso)" type="number" value={f.tolerancia_dias} onChange={(e) => setF({ ...f, tolerancia_dias: e.target.value })} />
        <label className="flex items-end gap-2 pb-2 text-[13px] text-ink-2"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Passo ligado</label>
      </div>
      <div className="flex gap-2"><Button size="sm" loading={salvando} onClick={salvar}>Salvar passo</Button><Button size="sm" variant="ghost" onClick={aoFechar}>Cancelar</Button></div>
    </div>
  )
}

// ── Parâmetros ─────────────────────────────────────────────────────────────────────────────────
function Parametros({ dados }: { dados: DadosConfigPosVenda }) {
  const router = useRouter()
  const p = dados.parametros
  const [cats, setCats] = useState<string[]>(categoriasPermitidas(p.categorias_modelo?.empresa))
  const [teto, setTeto] = useState(String(p.teto_diario?.empresa ?? 30))
  const [sla, setSla] = useState(String(p.sla_horas?.empresa ?? 'loja_aberta'))
  const [nota, setNota] = useState(String(p.nps_limite_chamado?.empresa ?? 6))
  const [janela, setJanela] = useState(String(p.janela_acompanhamento_dias?.empresa ?? 3))
  const [ocupado, setOcupado] = useState<string | null>(null)
  async function salvar(chave: string, valor: unknown, filialId?: number) {
    setOcupado(chave + (filialId ?? ''))
    const r = await gravar({ acao: 'parametro', chave, valor, filialId })
    setOcupado(null)
    if (r.ok) { notify.ok('Salvo'); router.refresh() }
  }
  const linha = 'flex flex-col gap-2 border-b border-line-soft py-4 sm:flex-row sm:items-end sm:justify-between'
  return (
    <div className="rounded-card border border-line bg-card px-4">
      <div className={linha}>
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium text-ink">Modelos que o pós-venda pode usar</div>
          <p className="text-[12px] text-ink-3">Com a janela de 24 h fechada, só modelo aprovado pela Meta. Padrão: só Utilidade. Marketing tem cobrança e regras de consentimento diferentes.</p>
          <div className="mt-2 flex gap-3">
            {CATEGORIAS_MODELO.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-[13px] text-ink-2">
                <input type="checkbox" checked={cats.includes(c)} onChange={(e) => setCats(e.target.checked ? [...cats, c] : cats.filter((x) => x !== c))} /> {ROTULO_CATEGORIA[c]}
              </label>
            ))}
          </div>
        </div>
        <Button size="sm" disabled={cats.length === 0} loading={ocupado === 'categorias_modelo'} onClick={() => salvar('categorias_modelo', cats)}>Salvar</Button>
      </div>
      <div className={linha}>
        <Input label="Passos por pessoa por dia (teto)" type="number" value={teto} onChange={(e) => setTeto(e.target.value)} wrapperClassName="sm:w-64" />
        <Button size="sm" loading={ocupado === 'teto_diario'} onClick={() => salvar('teto_diario', Number(teto))}>Salvar</Button>
      </div>
      <div className={linha}>
        <Select label="Prazo dos chamados conta" value={sla} onChange={(e) => setSla(e.target.value)} wrapperClassName="sm:w-64">
          <option value="loja_aberta">Só com a loja aberta (horário)</option><option value="corridas">Horas corridas</option>
        </Select>
        <Button size="sm" loading={ocupado === 'sla_horas'} onClick={() => salvar('sla_horas', sla)}>Salvar</Button>
      </div>
      <div className={linha}>
        <Input label="Nota que abre chamado (até)" type="number" value={nota} onChange={(e) => setNota(e.target.value)} wrapperClassName="sm:w-64" />
        <Button size="sm" loading={ocupado === 'nps_limite_chamado'} onClick={() => salvar('nps_limite_chamado', Number(nota))}>Salvar</Button>
      </div>
      <div className={linha}>
        <Input label="Dias em que a resposta do cliente fica no pós-venda" type="number" value={janela} onChange={(e) => setJanela(e.target.value)} wrapperClassName="sm:w-64" />
        <Button size="sm" loading={ocupado === 'janela_acompanhamento_dias'} onClick={() => salvar('janela_acompanhamento_dias', Number(janela))}>Salvar</Button>
      </div>
      <div className="py-4">
        <div className="text-[13.5px] font-medium text-ink">Responsável padrão por loja</div>
        <p className="mb-2 text-[12px] text-ink-3">Quando quem vendeu não pode atender (saiu, é administrador ou conta de serviço), o passo vai para esta pessoa antes da roleta da loja.</p>
        <div className="flex flex-col gap-2">
          {dados.lojas.map((l) => (
            <div key={l.id} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-[13px] text-ink-2">{l.nome}</span>
              <Select value={String(p.responsavel_padrao?.lojas?.[String(l.id)] ?? '')} wrapperClassName="flex-1"
                onChange={(e) => salvar('responsavel_padrao', e.target.value || null, l.id)}>
                <option value="">Nenhum (roleta da loja)</option>
                {dados.equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </Select>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Chamados ───────────────────────────────────────────────────────────────────────────────────
const PRIORIDADES = [['urgente', 'Urgente'], ['alta', 'Alta'], ['normal', 'Normal'], ['baixa', 'Baixa']] as const

function Chamados({ dados }: { dados: DadosConfigPosVenda }) {
  const router = useRouter()
  const [nova, setNova] = useState('')
  const [prazos, setPrazos] = useState(() => Object.fromEntries(PRIORIDADES.map(([p]) => {
    const s = dados.sla.find((x) => x.prioridade === p)
    return [p, { pr: String(s?.primeira_resposta_horas ?? ''), rs: String(s?.resolucao_horas ?? '') }]
  })) as Record<string, { pr: string; rs: string }>)
  async function enviar(corpo: Record<string, unknown>, aviso: string) {
    const r = await gravar(corpo)
    if (r.ok) { notify.ok(aviso); router.refresh() }
    return r.ok
  }
  const modo = dados.parametros.sla_horas?.empresa === 'corridas' ? 'horas corridas' : 'horas de loja aberta'
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-card border border-line bg-card px-4 py-3">
        <div className="mb-1 text-[13.5px] font-medium text-ink">Prazos por prioridade</div>
        <p className="mb-3 text-[12px] text-ink-3">Em {modo} (aba Parâmetros). Valem para os chamados abertos daqui em diante.</p>
        <div className="flex flex-col gap-2">
          {PRIORIDADES.map(([p, rotulo]) => (
            <div key={p} className="grid grid-cols-[80px_1fr_1fr_auto] items-end gap-2">
              <span className="pb-2 text-[13px] text-ink-2">{rotulo}</span>
              <Input label="1ª resposta (h)" type="number" value={prazos[p].pr} onChange={(e) => setPrazos({ ...prazos, [p]: { ...prazos[p], pr: e.target.value } })} />
              <Input label="Resolução (h)" type="number" value={prazos[p].rs} onChange={(e) => setPrazos({ ...prazos, [p]: { ...prazos[p], rs: e.target.value } })} />
              <Button size="sm" variant="outline" onClick={() => enviar({ acao: 'sla', prioridade: p, primeira_resposta_horas: Number(prazos[p].pr), resolucao_horas: Number(prazos[p].rs) }, 'Prazo salvo')}>Salvar</Button>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-card border border-line bg-card px-4 py-3">
        <div className="mb-2 text-[13.5px] font-medium text-ink">Categorias de chamado</div>
        <ul className="mb-3 flex flex-col gap-1.5">
          {dados.categoriasChamado.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className={cn('text-ink', !c.ativo && 'text-ink-3 line-through')}>{c.nome}</span>
              <button type="button" className="text-[12px] font-medium text-ink-2 hover:text-ink"
                onClick={() => enviar({ acao: 'categoria_chamado', id: c.id, nome: c.nome, ativo: !c.ativo }, c.ativo ? 'Categoria desligada' : 'Categoria religada')}>
                {c.ativo ? 'Desligar' : 'Religar'}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2">
          <Input label="Nova categoria" value={nova} onChange={(e) => setNova(e.target.value)} wrapperClassName="flex-1" />
          <Button size="sm" disabled={nova.trim().length < 2} onClick={async () => { if (await enviar({ acao: 'categoria_chamado', nome: nova }, 'Categoria criada')) setNova('') }}>Criar</Button>
        </div>
      </section>
    </div>
  )
}
