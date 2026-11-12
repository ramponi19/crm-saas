'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, RefreshCw, Trash2, UsersRound } from 'lucide-react'
import { Badge, Button, Card, ConfirmDialog, Input, Select, notify } from '@/components/ui'
import { agora } from '@/lib/datas'
import { descreverFiltro, type FiltroPublico } from '@/lib/transmissao/filtro'
import { atualizadoHa } from '@/lib/publicos/tempo'
import { FiltroCampos, useNomesDoFiltro, type EtapaOpcao, type FunilOpcao } from '@/components/modules/publicos/filtro-campos'

// ── O que a API devolve ──────────────────────────────────────────────────────
interface Publico {
  id: number; nome: string; filial_id: number | null; filtro: FiltroPublico; total: number; calculado_em: string | null
  /** Automações "entrou no público" ligadas / todas; transmissões agendadas. */
  gatilhos: number; automacoes: number; agendadas: number
}
interface Loja { id: number; nome: string }
interface Dados {
  admin: boolean; publicos: Publico[]; lojas: Loja[]; funis: FunilOpcao[]; etapas: EtapaOpcao[]
  form: { lojas: Loja[]; origens: string[] } | null
}
interface Previa { total: number; amostra: (string | null)[] }

async function post(corpo: Record<string, unknown>) {
  const r = await fetch('/api/publicos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `Falhou (HTTP ${r.status})`)
  return j
}

export function PublicosView() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [editando, setEditando] = useState<Publico | 'novo' | null>(null)
  const [apagar, setApagar] = useState<Publico | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)
  // "Atualizado há X": o relógio da tela anda de minuto em minuto.
  const [, setTique] = useState(0)

  const carregar = useCallback(async () => {
    const r = await fetch('/api/publicos')
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad(j.error ?? 'Não foi possível carregar os públicos.'); return }
    setDados(j as Dados)
  }, [])

  // Busca de dados: o setState é depois do fetch, não durante o efeito (mesmo caso da Transmissão).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => {
    const t = setInterval(() => setTique((x) => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  if (!dados) return <div className="flex items-center gap-2 p-8 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>

  const lojaNome = new Map(dados.lojas.map((l) => [l.id, l.nome]))
  const agoraTela = agora()

  async function atualizar(p: Publico) {
    setOcupado(p.id)
    try {
      const j = await post({ op: 'atualizar', id: p.id })
      notify.ok('Público atualizado.', j.entraram ? `${j.entraram} entraram desde a última conta.` : 'Ninguém novo desde a última conta.')
      await carregar()
    } catch (e) { notify.bad((e as Error).message) }
    finally { setOcupado(null) }
  }

  async function confirmarApagar() {
    if (!apagar) return
    setOcupado(apagar.id)
    try { await post({ op: 'apagar', id: apagar.id }); notify.ok('Público apagado.'); setApagar(null); await carregar() }
    catch (e) { notify.bad((e as Error).message) }
    finally { setOcupado(null) }
  }

  return (
    <div className="space-y-4">
      {dados.admin && (editando
        ? <FormPublico dados={dados} publico={editando === 'novo' ? null : editando} fechar={() => setEditando(null)}
            pronto={async () => { setEditando(null); await carregar() }} />
        : <div><Button icon={<UsersRound size={15} strokeWidth={1.7} />} onClick={() => setEditando('novo')} data-novo-publico>Novo público</Button></div>)}

      <Card title="Públicos" flush>
        {dados.publicos.length === 0 ? (
          <p className="p-6 text-sm text-ink-3">
            {dados.admin ? 'Nenhum público ainda. Salve uma regra (“em Proposta há 15 dias sem falar com a loja”) e use na Transmissão e no Automatize.' : 'Nenhum público nesta loja ainda.'}
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {dados.publicos.map((p) => (
              <ListaLinha key={p.id} p={p} dados={dados} loja={(p.filial_id && lojaNome.get(p.filial_id)) || 'Loja única'}
                quando={atualizadoHa(p.calculado_em, agoraTela)} ocupado={ocupado === p.id}
                editar={() => setEditando(p)} atualizar={() => atualizar(p)} apagar={() => setApagar(p)} />
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog open={!!apagar} onClose={() => setApagar(null)} onConfirm={confirmarApagar} loading={ocupado === apagar?.id} tone="danger"
        title="Apagar o público?" confirmLabel="Apagar"
        description={apagar ? <>
          O público <strong>{apagar.nome}</strong> some.
          {apagar.automacoes > 0 ? <> As <strong>{apagar.automacoes}</strong> automação(ões) de “entrou no público” dele também são apagadas.</> : null}
          {' '}Transmissões já feitas com ele ficam, com a regra que usaram.
        </> : null} />
    </div>
  )
}

function ListaLinha({ p, dados, loja, quando, ocupado, editar, atualizar, apagar }: {
  p: Publico; dados: Dados; loja: string; quando: string; ocupado: boolean; editar: () => void; atualizar: () => void; apagar: () => void
}) {
  const nomes = useNomesDoFiltro(dados.funis, dados.etapas)
  const deHora = p.gatilhos > 0 || p.agendadas > 0
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" data-publico-linha={p.id}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-ink">{p.nome}</span>
          {p.gatilhos > 0 && <Badge tone="acc" dot>{p.gatilhos} automação{p.gatilhos > 1 ? 'ões' : ''}</Badge>}
          {p.agendadas > 0 && <Badge tone="acc">{p.agendadas} transmissão agendada</Badge>}
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-3">{loja} · {descreverFiltro(p.filtro ?? {}, nomes)}</div>
      </div>
      <div className="text-right">
        <div className="num text-[18px] font-bold leading-none tracking-[-0.03em] text-ink" data-publico-total>{p.total}</div>
        <div className="mt-1 text-[11px] text-ink-3" data-publico-quando title={deHora ? 'Recontado de hora em hora' : 'Recontado ao editar ou em "Atualizar"'}>
          {quando}{deHora ? ' · de hora em hora' : ''}
        </div>
      </div>
      {dados.admin && (
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} loading={ocupado} onClick={atualizar} data-publico-atualizar>Atualizar</Button>
          <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={editar} data-publico-editar>Editar</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={apagar} data-publico-apagar>Apagar</Button>
        </div>
      )}
    </li>
  )
}

// ── Criar / editar: nome, loja, regra com prévia ─────────────────────────────
function FormPublico({ dados, publico, fechar, pronto }: { dados: Dados; publico: Publico | null; fechar: () => void; pronto: () => Promise<void> }) {
  const lojas = dados.form?.lojas ?? []
  const precisaLoja = lojas.length > 1 || dados.lojas.length > 1
  const [nome, setNome] = useState(publico?.nome ?? '')
  const [loja, setLoja] = useState<number | ''>(publico ? (publico.filial_id ?? '') : (lojas.length === 1 ? lojas[0].id : ''))
  const [filtro, setFiltro] = useState<FiltroPublico>(publico?.filtro ?? {})
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erroPrevia, setErroPrevia] = useState('')
  const [contando, setContando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const nomes = useNomesDoFiltro(dados.funis, dados.etapas)

  // Prévia da contagem: refeita meio segundo depois da última mudança.
  useEffect(() => {
    if (precisaLoja && !loja) return
    const t = setTimeout(async () => {
      setContando(true)
      try { const j = await post({ op: 'previa', filial_id: loja || null, filtro }); setPrevia(j.previa as Previa); setErroPrevia('') }
      catch (e) { setPrevia(null); setErroPrevia((e as Error).message) }
      finally { setContando(false) }
    }, 500)
    return () => clearTimeout(t)
  }, [loja, filtro, precisaLoja])

  const pronta = !!nome.trim() && (!precisaLoja || !!loja) && !erroPrevia

  async function salvar() {
    setSalvando(true)
    try {
      if (publico) {
        const j = await post({ op: 'editar', id: publico.id, nome, filtro })
        notify.ok('Público salvo.', j.recontou ? 'Recontado pela regra nova (sem disparar automação).' : undefined)
      } else {
        const j = await post({ op: 'criar', nome, filial_id: loja || null, filtro })
        notify.ok('Público criado.', `${j.total} contatos agora.`)
      }
      await pronto()
    } catch (e) { notify.bad((e as Error).message) }
    finally { setSalvando(false) }
  }

  return (
    <Card title={publico ? `Editar público · ${publico.nome}` : 'Novo público'} actions={<Button variant="ghost" size="sm" onClick={fechar}>Cancelar</Button>} data-publico-form>
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Proposta parada há 15 dias" maxLength={80} data-publico-nome />
            {precisaLoja && (
              <Select label="Loja" value={loja} disabled={!!publico} onChange={(e) => setLoja(Number(e.target.value) || '')} data-publico-loja>
                <option value="">Escolha a loja</option>
                {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </Select>
            )}
          </div>
          <section className="space-y-3">
            <h4 className="text-[12px] font-semibold text-ink">Quem entra</h4>
            <FiltroCampos filtro={filtro} onChange={setFiltro} funis={dados.funis} etapas={dados.etapas}
              origens={dados.form?.origens ?? []} etiquetasAttr="data-filtro-etiquetas-publico" />
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start" data-previa>
          <div className="rounded-card border border-line bg-bg p-4">
            <div className="text-[11px] font-medium text-ink-3">No público agora</div>
            <div className="num mt-1 text-[28px] font-bold leading-none tracking-[-0.035em] text-ink" data-previa-total>
              {contando && !previa ? '…' : previa ? previa.total : '—'}
            </div>
            <p className="mt-2 text-[11.5px] text-ink-2">{descreverFiltro(filtro, nomes)}</p>
            {erroPrevia && <p className="mt-2 text-[11.5px] text-bad">{erroPrevia}</p>}
            {precisaLoja && !loja && <p className="mt-2 text-[11.5px] text-ink-3">Escolha a loja para contar.</p>}
            {previa && previa.amostra.length > 0 && (
              <p className="mt-3 text-[11px] text-ink-3">Ex.: {previa.amostra.map((n) => n ?? 'sem nome').join(', ')}</p>
            )}
            <p className="mt-3 text-[11px] leading-snug text-ink-3">
              Só negócio ativo entra. {publico ? 'Mudar a regra reconta agora' : 'Salvar conta agora'} e não dispara automação: quem já está no público é o ponto de partida.
            </p>
          </div>
          <Button className="w-full" disabled={!pronta || salvando} loading={salvando} onClick={salvar} data-publico-salvar>
            {publico ? 'Salvar' : 'Criar público'}
          </Button>
        </aside>
      </div>
    </Card>
  )
}
