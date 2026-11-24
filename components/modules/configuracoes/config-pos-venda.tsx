'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Pencil, Plus, X } from 'lucide-react'
import { Badge, Button, Input, Select, Textarea, Tabs, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import { montarMensagem } from '@/lib/posvenda/fila'
import {
  ANCORAS, AVISO_SEM_MODELO, BOTAO_SEM_OFERTAS_PADRAO, CATEGORIAS_MODELO, CONFIRMACAO_SEM_OFERTAS_PADRAO, DIA_JANELA_PROVAVELMENTE_FECHADA, MENSAGEM_NEUTRO_PADRAO, MENSAGEM_PROMOTOR_PADRAO,
  OPERADORES, ROTULO_CATEGORIA, TIPOS_CAMPO, categoriasPermitidas, descreverQuando, numeroPositivo, passoPrecisaDeModelo,
  type AncoraTipo, type FiltroCampo, type OperadorFiltro, type TipoCampoVenda,
} from '@/lib/posvenda/config'

type Filtros = { categorias?: number[]; condicao?: string; campos?: FiltroCampo[] }
export interface DadosConfigPosVenda {
  reguas: { id: number; nome: string; ativo: boolean; prioridade: number; filtros: Filtros; ao_recomprar: string }[]
  passos: { id: number; cadencia_id: number; ordem: number; dia_offset: number; tipo_acao: string; titulo: string; roteiro: string | null
    grupo: string; ativo: boolean; responsavel: string; modelo_id: number | null; filtros: Filtros; tolerancia_dias: number
    ancora_tipo: AncoraTipo; ancora_mes_dia: string | null; ancora_campo: string | null; uso_alvo: number | null
    uso_ritmo_campo: string | null; uso_ritmo_padrao: number | null; repetir_intervalo: number | null; repetir_unidade: string | null; repetir_max: number | null }[]
  modelos: { id: number; nome: string; categoria: string; corpo: string; status: string }[]
  /** As categorias que a régua escolhe: as do modal de venda (Estoque ou próprias). */
  categorias: { id: number; nome: string }[]
  fonteCategorias: 'estoque' | 'proprias'
  temEstoque: boolean
  categoriasProprias: { id: number; nome: string; ativo: boolean; ordem: number }[]
  /** Campos personalizados de negócio e cliente (âncoras e filtros); os de negócio do Pós-venda são os campos da venda. */
  campos: { id: number; entidade: 'negocio' | 'contato'; chave: string; rotulo: string; tipo: string; opcoes: string[]; modulo_dono: string | null
    obrigatorio_na_venda: boolean; ativo: boolean }[]
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

const rotulosDosCampos = (d: DadosConfigPosVenda) => Object.fromEntries(d.campos.map((c) => [c.chave, c.rotulo]))

/** CONFIGURAÇÕES › PÓS-VENDA (C7 bloco 3). Réguas e passos, venda (categorias e campos), parâmetros e chamados. */
export function ConfigPosVenda({ dados }: { dados: DadosConfigPosVenda }) {
  const [aba, setAba] = useState<'reguas' | 'venda' | 'parametros' | 'chamados'>('reguas')
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Pós-venda</h1>
        <p className="mt-1 text-[13px] text-ink-2">Réguas de contato depois da venda, parâmetros e chamados. Mudanças valem para as vendas novas.</p>
      </header>
      <Tabs className="mb-4" value={aba} onValueChange={(v) => setAba(v as typeof aba)}
        items={[{ value: 'reguas', label: 'Réguas' }, { value: 'venda', label: 'Venda' }, { value: 'parametros', label: 'Parâmetros' }, { value: 'chamados', label: 'Chamados' }]} />
      {aba === 'reguas' && <Reguas dados={dados} />}
      {aba === 'venda' && <Venda dados={dados} />}
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
  const passos = dados.passos.filter((p) => p.cadencia_id === regua.id).sort((a, b) => a.ordem - b.ordem)
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
            {regua.filtros.condicao ? ` · só ${regua.filtros.condicao === 'novo' ? 'novo' : 'usado'}` : ''} · prioridade {regua.prioridade}
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
  const rotulos = rotulosDosCampos(dados)
  const filtros = (passo.filtros.campos ?? []).map((f) => `${rotulos[f.chave] ?? f.chave} ${OPERADORES[f.op] ?? f.op}${f.op === 'preenchido' ? '' : ` ${f.valor}`}`)
  return (
    <li className={cn('px-4 py-2.5', !passo.ativo && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] text-ink">
            <span className="font-medium">{passo.titulo}</span>
            <span className="text-ink-3"> · {TIPOS[passo.tipo_acao] ?? passo.tipo_acao}{passo.filtros.condicao ? ` · só ${passo.filtros.condicao === 'novo' ? 'novo' : 'usado'}` : ''}{!passo.ativo ? ' · desligado' : ''}</span>
          </div>
          <div className="text-[12px] text-ink-2">{descreverQuando(passo, rotulos)}</div>
          {filtros.length > 0 && <div className="text-[12px] text-ink-3">Só quando {filtros.join(' e ')}</div>}
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
          {dados.categorias.length === 0 && <span className="text-[12px] text-ink-3">A empresa não tem categorias de venda. Crie na aba Venda.</span>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Condição da venda" value={f.condicao} onChange={(e) => setF({ ...f, condicao: e.target.value })}>
          <option value="">Qualquer</option><option value="novo">Só novo</option><option value="usado">Só usado</option>
        </Select>
        <Select label="Se o cliente comprar de novo na mesma categoria" value={f.ao_recomprar} onChange={(e) => setF({ ...f, ao_recomprar: e.target.value })}>
          <option value="reiniciar">Cancela os passos do produto desta compra</option><option value="manter">Mantém todos os passos desta compra</option><option value="encerrar">Encerra esta régua</option>
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
    ancora_tipo: (passo?.ancora_tipo ?? 'venda') as AncoraTipo, ancora_mes_dia: passo?.ancora_mes_dia ?? '12-25', ancora_campo: passo?.ancora_campo ?? '',
    uso_alvo: passo?.uso_alvo != null ? String(passo.uso_alvo) : '', uso_ritmo_campo: passo?.uso_ritmo_campo ?? '',
    uso_ritmo_padrao: passo?.uso_ritmo_padrao != null ? String(passo.uso_ritmo_padrao) : '',
    repetir: passo?.repetir_intervalo != null, repetir_intervalo: String(passo?.repetir_intervalo ?? 12), repetir_unidade: passo?.repetir_unidade ?? 'meses',
    repetir_max: passo?.repetir_max != null ? String(passo.repetir_max) : '',
  })
  const [filtros, setFiltros] = useState<FiltroCampo[]>(passo?.filtros.campos ?? [])
  const [salvando, setSalvando] = useState(false)
  const camposAtivos = dados.campos.filter((c) => c.ativo)
  const camposData = camposAtivos.filter((c) => c.tipo === 'data')
  const camposNumero = camposAtivos.filter((c) => c.tipo === 'numero' || c.tipo === 'moeda')
  const rotulos = rotulosDosCampos(dados)
  const [mes, diaDoMes] = f.ancora_mes_dia.split('-')
  const permitidas = categoriasPermitidas(dados.parametros.categorias_modelo?.empresa) as string[]
  const aprovados = dados.modelos.filter((m) => m.status === 'aprovado')
  const previa = useMemo(() => montarMensagem(f.roteiro, EXEMPLO), [f.roteiro])
  const precisa = passoPrecisaDeModelo({ tipo_acao: f.tipo_acao, dia_offset: Number(f.dia_offset) || 0, modelo_id: f.modelo_id ? 1 : null, ativo: f.ativo, ancora_tipo: f.ancora_tipo })
  const modeloEscolhido = aprovados.find((m) => String(m.id) === f.modelo_id)

  async function salvar() {
    setSalvando(true)
    const r = await gravar({ acao: 'passo', id: passo?.id, cadencia_id: cadenciaId, ...f, ordem: Number(f.ordem), dia_offset: Number(f.dia_offset),
      tolerancia_dias: Number(f.tolerancia_dias), modelo_id: f.modelo_id ? Number(f.modelo_id) : null, condicao: f.condicao || null,
      repetir_max: f.repetir ? f.repetir_max : '', campos: filtros })
    setSalvando(false)
    if (r.ok) { notify.ok('Passo salvo'); aoFechar(); router.refresh() }
  }
  return (
    <div className="flex flex-col gap-3 rounded-control border border-line-soft bg-bg p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Select label="Quando" value={f.ancora_tipo} onChange={(e) => {
          const a = e.target.value as AncoraTipo
          setF({ ...f, ancora_tipo: a, dia_offset: a === 'venda' ? String(Math.max(0, Number(f.dia_offset) || 0)) : '0',
            repetir: a === 'data_fixa' ? true : f.repetir, // data do ano: todo ano por padrão
            repetir_unidade: a === 'data_fixa' ? 'meses' : f.repetir_unidade, repetir_intervalo: a === 'data_fixa' ? '12' : f.repetir_intervalo })
        }}>
          {Object.entries(ANCORAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select label="Tipo" value={f.tipo_acao} onChange={(e) => setF({ ...f, tipo_acao: e.target.value })}>
          {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Input label="Ordem" type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {f.ancora_tipo === 'data_fixa' && <>
          <Input label="Dia" type="number" min={1} max={31} value={String(Number(diaDoMes) || 1)}
            onChange={(e) => setF({ ...f, ancora_mes_dia: `${mes}-${String(Math.min(31, Math.max(1, Number(e.target.value) || 1))).padStart(2, '0')}` })} />
          <Select label="Mês" value={mes} onChange={(e) => setF({ ...f, ancora_mes_dia: `${e.target.value}-${diaDoMes}` })}>
            {['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'].map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </Select>
        </>}
        {f.ancora_tipo === 'campo_data' && (
          <Select label="Campo de data" value={f.ancora_campo} onChange={(e) => setF({ ...f, ancora_campo: e.target.value })} wrapperClassName="sm:col-span-2">
            <option value="">Escolha…</option>
            {camposData.map((c) => <option key={c.id} value={c.chave}>{c.rotulo} ({c.entidade === 'contato' ? 'cliente' : 'venda'})</option>)}
          </Select>
        )}
        {f.ancora_tipo === 'uso' && <>
          <Select label="Campo do uso na venda" value={f.ancora_campo} onChange={(e) => setF({ ...f, ancora_campo: e.target.value })}>
            <option value="">Escolha…</option>
            {camposNumero.map((c) => <option key={c.id} value={c.chave}>{c.rotulo}</option>)}
          </Select>
          <Input label="A cada (quanto de uso)" inputMode="decimal" placeholder="10000" value={f.uso_alvo} onChange={(e) => setF({ ...f, uso_alvo: e.target.value })} />
        </>}
        <Input label={f.ancora_tipo === 'venda' ? 'Dias depois da venda' : 'Ajuste em dias (negativo = antes)'} type="number"
          value={f.dia_offset} onChange={(e) => setF({ ...f, dia_offset: e.target.value })} />
      </div>
      {f.ancora_tipo === 'uso' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input label="Uso por dia (padrão)" inputMode="decimal" placeholder="50" value={f.uso_ritmo_padrao} onChange={(e) => setF({ ...f, uso_ritmo_padrao: e.target.value })} />
          <Select label="Ou o campo da venda com o uso por dia" value={f.uso_ritmo_campo} onChange={(e) => setF({ ...f, uso_ritmo_campo: e.target.value })}>
            <option value="">Nenhum (usa o padrão)</option>
            {camposNumero.map((c) => <option key={c.id} value={c.chave}>{c.rotulo}</option>)}
          </Select>
          <p className="text-[11.5px] text-ink-3 sm:col-span-2">
            O Nexus estima a data pelo valor informado na venda e o uso por dia. Quando alguém informa um valor novo na ficha do cliente, o ritmo é recalculado com o uso real.
          </p>
        </div>
      )}
      {f.ancora_tipo === 'campo_data' && camposData.length === 0 && <p className="text-[11.5px] text-warn">Nenhum campo de data. Crie um na aba Venda.</p>}
      {f.ancora_tipo === 'uso' && camposNumero.length === 0 && <p className="text-[11.5px] text-warn">Nenhum campo de número. Crie um na aba Venda (ex.: uso atual).</p>}
      <div className="flex flex-col gap-2 rounded-control border border-line-soft bg-card p-2.5">
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.checked })} />
          {f.ancora_tipo === 'uso' ? `Repetir a cada ${f.uso_alvo || '…'} de uso` : 'Repetir este passo'}
        </label>
        {f.repetir && (
          <div className="grid gap-2 sm:grid-cols-3">
            {f.ancora_tipo !== 'uso' && <>
              <Input label="A cada" type="number" min={1} value={f.repetir_intervalo} onChange={(e) => setF({ ...f, repetir_intervalo: e.target.value })} />
              <Select label="Unidade" value={f.repetir_unidade} onChange={(e) => setF({ ...f, repetir_unidade: e.target.value })}>
                <option value="dias">dias</option><option value="meses">meses</option>
              </Select>
            </>}
            <Input label="Até quantas vezes (vazio = sem limite)" type="number" min={2} value={f.repetir_max} onChange={(e) => setF({ ...f, repetir_max: e.target.value })} />
          </div>
        )}
        <p className="text-[12px] text-ink-2">
          {descreverQuando({
            dia_offset: Number(f.dia_offset) || 0, ancora_tipo: f.ancora_tipo, ancora_mes_dia: f.ancora_mes_dia, ancora_campo: f.ancora_campo || null,
            uso_alvo: numeroPositivo(f.uso_alvo), uso_ritmo_campo: f.uso_ritmo_campo || null,
            uso_ritmo_padrao: numeroPositivo(f.uso_ritmo_padrao),
            repetir_intervalo: f.repetir ? Number(f.repetir_intervalo) || 1 : null, repetir_unidade: f.repetir_unidade, repetir_max: f.repetir ? Number(f.repetir_max) || null : null,
          }, rotulos)}
        </p>
      </div>
      <Input label="Título (o que aparece na fila)" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
      {f.tipo_acao !== 'tarefa_interna' && (
        <div>
          <Textarea label="Roteiro (mensagem com a janela de 24 h aberta)" rows={3} value={f.roteiro} onChange={(e) => setF({ ...f, roteiro: e.target.value })} />
          <p className="mt-1 text-[11.5px] text-ink-3">Variáveis: {'{{nome}}'} (primeiro nome), {'{{produto}}'}, {'{{loja}}'}, {'{{vendedor}}'} e {'{{campo:chave}}'} para um campo personalizado do negócio ou do cliente (ex.: {'{{campo:numero_serie}}'}).</p>
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
          <p className="mt-1 text-[11.5px] text-ink-3">Na fila, o Nexus preenche {'{{1}}'} com o primeiro nome do cliente e {'{{2}}'} com o produto comprado; crie os modelos nessa ordem.</p>
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
          <option value="">Novo e usado</option><option value="novo">Só novo</option><option value="usado">Só usado</option>
        </Select>
        <Select label="Responsável" value={f.responsavel.startsWith('usuario:') ? f.responsavel : f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })}>
          <option value="acompanhamento">Quem vendeu (regra padrão)</option>
          <option value="administradores">Administradores</option>
          {dados.equipe.map((p) => <option key={p.id} value={`usuario:${p.id}`}>{p.nome}</option>)}
        </Select>
      </div>
      <FiltrosDoPasso campos={camposAtivos} filtros={filtros} onChange={setFiltros} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Input label="Tolerância (dias de atraso)" type="number" value={f.tolerancia_dias} onChange={(e) => setF({ ...f, tolerancia_dias: e.target.value })} />
        <label className="flex items-end gap-2 pb-2 text-[13px] text-ink-2"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Passo ligado</label>
      </div>
      <div className="flex gap-2"><Button size="sm" loading={salvando} onClick={salvar}>Salvar passo</Button><Button size="sm" variant="ghost" onClick={aoFechar}>Cancelar</Button></div>
    </div>
  )
}

/** Só para as vendas em que… (filtros por valor de campo). */
function FiltrosDoPasso({ campos, filtros, onChange }: {
  campos: DadosConfigPosVenda['campos']; filtros: FiltroCampo[]; onChange: (f: FiltroCampo[]) => void
}) {
  if (campos.length === 0) return null
  const muda = (i: number, p: Partial<FiltroCampo>) => onChange(filtros.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[12px] font-medium text-ink-2">Só para as vendas em que…</div>
      {filtros.map((x, i) => {
        const campo = campos.find((c) => c.chave === x.chave)
        return (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-1.5">
            <Select value={x.chave} onChange={(e) => muda(i, { chave: e.target.value })} aria-label="Campo">
              {campos.map((c) => <option key={c.id} value={c.chave}>{c.rotulo}</option>)}
            </Select>
            <Select value={x.op} onChange={(e) => muda(i, { op: e.target.value as OperadorFiltro })} aria-label="Condição">
              {Object.entries(OPERADORES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            {x.op === 'preenchido' ? <span /> : campo?.tipo === 'opcao' && campo.opcoes.length ? (
              <Select value={x.valor} onChange={(e) => muda(i, { valor: e.target.value })} aria-label="Valor">
                <option value="">Escolha…</option>
                {campo.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            ) : (
              <Input value={x.valor} onChange={(e) => muda(i, { valor: e.target.value })} aria-label="Valor" />
            )}
            <Button size="sm" variant="ghost" aria-label="Tirar filtro" icon={<X size={14} strokeWidth={1.8} />} onClick={() => onChange(filtros.filter((_, j) => j !== i))} />
          </div>
        )
      })}
      {filtros.length < 10 && (
        <Button size="sm" variant="outline" className="self-start" icon={<Plus size={13} strokeWidth={1.8} />}
          onClick={() => onChange([...filtros, { chave: campos[0].chave, op: 'igual', valor: '' }])}>Filtro por campo</Button>
      )}
    </div>
  )
}

// ── Venda: categorias e campos ─────────────────────────────────────────────────────────────────
function Venda({ dados }: { dados: DadosConfigPosVenda }) {
  const router = useRouter()
  const [fonte, setFonte] = useState(dados.fonteCategorias)
  const [novaCat, setNovaCat] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [novo, setNovo] = useState({ rotulo: '', tipo: 'texto' as TipoCampoVenda, opcoes: '', obrigatorio: false })
  const camposVenda = dados.campos.filter((c) => c.entidade === 'negocio' && c.modulo_dono === 'posvenda')
  async function enviar(corpo: Record<string, unknown>, aviso: string, chave: string) {
    setOcupado(chave)
    const r = await gravar(corpo)
    setOcupado(null)
    if (r.ok) { notify.ok(aviso); router.refresh() }
    return r.ok
  }
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-card border border-line bg-card px-4 py-3">
        <div className="mb-1 text-[13.5px] font-medium text-ink">Categorias da venda</div>
        <p className="mb-3 text-[12px] text-ink-3">
          A categoria escolhida ao marcar a venda decide a régua. Quem usa o Estoque pode seguir com as categorias dele; quem não usa cria as próprias aqui.
          Ao trocar a origem, revise as categorias das réguas.
        </p>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <Select label="Origem das categorias" value={fonte} onChange={(e) => setFonte(e.target.value as typeof fonte)} wrapperClassName="sm:w-72">
            <option value="estoque">As do Estoque{dados.temEstoque ? '' : ' (nenhuma cadastrada)'}</option>
            <option value="proprias">Próprias do Pós-venda</option>
          </Select>
          <Button size="sm" disabled={fonte === dados.fonteCategorias} loading={ocupado === 'fonte'}
            onClick={() => enviar({ acao: 'parametro', chave: 'categorias_fonte', valor: fonte }, 'Origem salva', 'fonte')}>Salvar</Button>
        </div>
        {fonte === 'proprias' && <>
          <ul className="mb-3 flex flex-col gap-1.5">
            {dados.categoriasProprias.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className={cn('text-ink', !c.ativo && 'text-ink-3 line-through')}>{c.nome}</span>
                <button type="button" className="text-[12px] font-medium text-ink-2 hover:text-ink"
                  onClick={() => enviar({ acao: 'categoria_venda', id: c.id, nome: c.nome, ordem: c.ordem, ativo: !c.ativo }, c.ativo ? 'Categoria desligada' : 'Categoria religada', 'cat' + c.id)}>
                  {c.ativo ? 'Desligar' : 'Religar'}
                </button>
              </li>
            ))}
            {dados.categoriasProprias.length === 0 && <li className="text-[12px] text-ink-3">Nenhuma categoria ainda.</li>}
          </ul>
          <div className="flex items-end gap-2">
            <Input label="Nova categoria" value={novaCat} onChange={(e) => setNovaCat(e.target.value)} wrapperClassName="flex-1" />
            <Button size="sm" disabled={novaCat.trim().length < 2} loading={ocupado === 'novacat'} onClick={async () => {
              if (await enviar({ acao: 'categoria_venda', nome: novaCat, ordem: dados.categoriasProprias.length + 1 }, 'Categoria criada', 'novacat')) setNovaCat('')
            }}>Criar</Button>
          </div>
        </>}
      </section>

      <section className="rounded-card border border-line bg-card px-4 py-3">
        <div className="mb-1 text-[13.5px] font-medium text-ink">Campos da venda</div>
        <p className="mb-3 text-[12px] text-ink-3">
          Aparecem no modal de venda (ex.: número de série, uso atual, data da próxima revisão). Servem para a régua: data de um campo, uso estimado, filtros
          e {'{{campo:chave}}'} no roteiro. O nome interno não muda depois de criado.
        </p>
        <ul className="mb-3 flex flex-col divide-y divide-line-soft">
          {camposVenda.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[13px]">
              <span className={cn('min-w-0 text-ink', !c.ativo && 'text-ink-3 line-through')}>
                {c.rotulo} <span className="text-[12px] text-ink-3">· {TIPOS_CAMPO[c.tipo as TipoCampoVenda] ?? c.tipo} · {'{{campo:' + c.chave + '}}'}{c.obrigatorio_na_venda ? ' · obrigatório' : ''}</span>
              </span>
              <span className="flex gap-3">
                <button type="button" className="text-[12px] font-medium text-ink-2 hover:text-ink"
                  onClick={() => enviar({ acao: 'campo_venda', id: c.id, rotulo: c.rotulo, tipo: c.tipo, opcoes: c.opcoes, ativo: c.ativo, obrigatorio: !c.obrigatorio_na_venda }, 'Campo salvo', 'ob' + c.id)}>
                  {c.obrigatorio_na_venda ? 'Tornar opcional' : 'Tornar obrigatório'}
                </button>
                <button type="button" className="text-[12px] font-medium text-ink-2 hover:text-ink"
                  onClick={() => enviar({ acao: 'campo_venda', id: c.id, rotulo: c.rotulo, tipo: c.tipo, opcoes: c.opcoes, obrigatorio: c.obrigatorio_na_venda, ativo: !c.ativo }, c.ativo ? 'Campo desligado' : 'Campo religado', 'at' + c.id)}>
                  {c.ativo ? 'Desligar' : 'Religar'}
                </button>
              </span>
            </li>
          ))}
          {camposVenda.length === 0 && <li className="py-1.5 text-[12px] text-ink-3">Nenhum campo ainda.</li>}
        </ul>
        <div className="flex flex-col gap-2 rounded-control border border-line-soft bg-bg p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input label="Nome do campo" placeholder="Uso atual" value={novo.rotulo} onChange={(e) => setNovo({ ...novo, rotulo: e.target.value })} />
            <Select label="Tipo" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as TipoCampoVenda })}>
              {Object.entries(TIPOS_CAMPO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          {novo.tipo === 'opcao' && <Textarea label="Opções (uma por linha)" rows={3} value={novo.opcoes} onChange={(e) => setNovo({ ...novo, opcoes: e.target.value })} />}
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={novo.obrigatorio} onChange={(e) => setNovo({ ...novo, obrigatorio: e.target.checked })} /> Obrigatório ao marcar a venda
          </label>
          <Button size="sm" className="self-start" disabled={novo.rotulo.trim().length < 2} loading={ocupado === 'novocampo'} onClick={async () => {
            const ok = await enviar({ acao: 'campo_venda', rotulo: novo.rotulo, tipo: novo.tipo, opcoes: novo.opcoes.split('\n'), obrigatorio: novo.obrigatorio }, 'Campo criado', 'novocampo')
            if (ok) setNovo({ rotulo: '', tipo: 'texto', opcoes: '', obrigatorio: false })
          }}>Criar campo</Button>
        </div>
      </section>
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
  const [pausaTerceiro, setPausaTerceiro] = useState(p.sla_pausa_terceiro?.empresa === true)
  const [nota, setNota] = useState(String(p.nps_limite_chamado?.empresa ?? 6))
  const [janela, setJanela] = useState(String(p.janela_acompanhamento_dias?.empresa ?? 3))
  const [promotor, setPromotor] = useState(String(p.mensagem_promotor?.empresa ?? ''))
  const [neutro, setNeutro] = useState(String(p.mensagem_neutro?.empresa ?? ''))
  const so = (p['core.sem_ofertas']?.empresa ?? null) as { botoes?: string[]; confirmacao?: string } | null
  const [botoesSo, setBotoesSo] = useState((so?.botoes ?? [BOTAO_SEM_OFERTAS_PADRAO]).join('\n'))
  const [confirmaSo, setConfirmaSo] = useState(so?.confirmacao ?? CONFIRMACAO_SEM_OFERTAS_PADRAO)
  const [condVenda, setCondVenda] = useState(String(p['core.condicao_venda']?.empresa ?? 'exigida'))
  const [links, setLinks] = useState<Record<string, string>>(() => Object.fromEntries(dados.lojas.map((l) => [String(l.id), String(p.link_avaliacao?.lojas?.[String(l.id)] ?? '')])))
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
        <Select label="Condição na venda (novo ou usado)" value={condVenda} onChange={(e) => setCondVenda(e.target.value)} wrapperClassName="sm:w-64">
          <option value="exigida">Exigida ao marcar a venda</option><option value="opcional">Opcional</option><option value="nao_usa">Não usa (ex.: serviços)</option>
        </Select>
        <Button size="sm" loading={ocupado === 'condicao_venda'} onClick={async () => {
          setOcupado('condicao_venda')
          const r = await gravar({ acao: 'condicao_venda', valor: condVenda })
          setOcupado(null)
          if (r.ok) { notify.ok('Salvo'); router.refresh() }
        }}>Salvar</Button>
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
        <div className="min-w-0">
          <label className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
            <input type="checkbox" checked={pausaTerceiro} onChange={(e) => setPausaTerceiro(e.target.checked)} /> “Aguardando terceiro” também pausa o prazo
          </label>
          <p className="text-[12px] text-ink-3">“Aguardando cliente” sempre pausa. Ligue se a espera pela assistência ou pelo fornecedor não deve contar no prazo do chamado.</p>
        </div>
        <Button size="sm" loading={ocupado === 'sla_pausa_terceiro'} onClick={() => salvar('sla_pausa_terceiro', pausaTerceiro)}>Salvar</Button>
      </div>
      <div className={linha}>
        <Input label="Nota que abre chamado (até)" type="number" value={nota} onChange={(e) => setNota(e.target.value)} wrapperClassName="sm:w-64" />
        <Button size="sm" loading={ocupado === 'nps_limite_chamado'} onClick={() => salvar('nps_limite_chamado', Number(nota))}>Salvar</Button>
      </div>
      <div className={linha}>
        <Input label="Dias em que a resposta do cliente fica no pós-venda" type="number" value={janela} onChange={(e) => setJanela(e.target.value)} wrapperClassName="sm:w-64" />
        <Button size="sm" loading={ocupado === 'janela_acompanhamento_dias'} onClick={() => salvar('janela_acompanhamento_dias', Number(janela))}>Salvar</Button>
      </div>
      <div className="border-b border-line-soft py-4">
        <div className="text-[13.5px] font-medium text-ink">Depois da nota</div>
        <p className="mb-2 text-[12px] text-ink-3">
          Logo depois de registrar a nota, a fila sugere a próxima mensagem (vai como mensagem normal: o cliente acabou de responder).
          9 ou 10: pedido de avaliação no Google com o link da loja. 7 ou 8: pergunta do que poderia ter sido melhor. Até a nota que abre chamado: o chamado.
          Variáveis: {'{{nome}}'} e {'{{link}}'}.
        </p>
        <div className="flex flex-col gap-2">
          {dados.lojas.map((l) => (
            <div key={l.id} className="flex items-end gap-2">
              <Input label={`Link da avaliação no Google · ${l.nome}`} placeholder="https://g.page/r/…/review" value={links[String(l.id)] ?? ''}
                onChange={(e) => setLinks({ ...links, [String(l.id)]: e.target.value })} wrapperClassName="flex-1" />
              <Button size="sm" loading={ocupado === 'link_avaliacao' + l.id} onClick={() => salvar('link_avaliacao', links[String(l.id)]?.trim() || null, l.id)}>Salvar</Button>
            </div>
          ))}
          <div className="flex items-end gap-2">
            <Textarea label="Mensagem para quem deu 9 ou 10" rows={2} placeholder={MENSAGEM_PROMOTOR_PADRAO} value={promotor} onChange={(e) => setPromotor(e.target.value)} wrapperClassName="flex-1" />
            <Button size="sm" disabled={promotor.trim().length < 3} loading={ocupado === 'mensagem_promotor'} onClick={() => salvar('mensagem_promotor', promotor)}>Salvar</Button>
          </div>
          <div className="flex items-end gap-2">
            <Textarea label="Mensagem para quem deu 7 ou 8" rows={2} placeholder={MENSAGEM_NEUTRO_PADRAO} value={neutro} onChange={(e) => setNeutro(e.target.value)} wrapperClassName="flex-1" />
            <Button size="sm" disabled={neutro.trim().length < 3} loading={ocupado === 'mensagem_neutro'} onClick={() => salvar('mensagem_neutro', neutro)}>Salvar</Button>
          </div>
        </div>
      </div>
      <div className="border-b border-line-soft py-4">
        <div className="text-[13.5px] font-medium text-ink">“Não quero receber ofertas”</div>
        <p className="mb-2 text-[12px] text-ink-3">
          Quando o cliente toca um destes botões num modelo do WhatsApp, o Nexus marca o contato como sem ofertas (para de enviar modelos de
          Marketing; os de Utilidade continuam) e responde na hora com a confirmação. Use o mesmo texto do botão criado na Meta. Variável: {'{{nome}}'}.
        </p>
        <div className="flex flex-col gap-2">
          <Textarea label="Textos dos botões (um por linha)" rows={2} value={botoesSo} onChange={(e) => setBotoesSo(e.target.value)} />
          <Textarea label="Confirmação enviada ao cliente" rows={2} value={confirmaSo} onChange={(e) => setConfirmaSo(e.target.value)} />
          <Button size="sm" className="self-start" loading={ocupado === 'sem_ofertas'} onClick={async () => {
            setOcupado('sem_ofertas')
            const r = await gravar({ acao: 'sem_ofertas', botoes: botoesSo.split('\n'), confirmacao: confirmaSo })
            setOcupado(null)
            if (r.ok) { notify.ok('Salvo'); router.refresh() }
          }}>Salvar</Button>
        </div>
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
