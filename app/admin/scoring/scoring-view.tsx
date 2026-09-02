'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Button, Input, Select, Badge, notify } from '@/components/ui'
import { calcularScore, type ScoreConfig } from '@/lib/lead-score'
import { Flame, Save, RefreshCw, Zap } from 'lucide-react'

export interface CadenciaOpt { id: number; nome: string }

const TIER_CHIP: Record<string, string> = {
  quente: 'bg-accent-soft text-accent',
  morno: 'bg-warn-soft text-warn',
  frio: 'bg-ink/[0.06] text-ink-3',
}

function NumField({ label, value, onChange, hint }: { label: string; value: number; onChange: (n: number) => void; hint?: string }) {
  return <Input label={label} hint={hint} type="number" value={String(value)} onChange={(e) => onChange(Number(e.target.value) || 0)} />
}

/**
 * Fora do componente de propósito.
 *
 * Declarada dentro, ela virava um tipo NOVO a cada render: o React não
 * reconhece o componente como o mesmo, descarta a subárvore e monta outra do
 * zero — o que apaga o estado de tudo que estiver dentro. Aqui não havia estado
 * a perder, mas o custo de remontar sete blocos a cada tecla digitada existia,
 * e a regra nova do React 19 apontou.
 */
const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div className="rounded-card border border-line bg-card p-4">
    <div className="mb-3 text-[13.5px] font-semibold text-ink">{titulo}</div>
    {children}
  </div>
)

export function ScoringView({ configInicial, cadencias }: { configInicial: ScoreConfig; cadencias: CadenciaOpt[] }) {
  const [cfg, setCfg] = useState<ScoreConfig>(configInicial)
  const [salvando, setSalvando] = useState(false)
  const [reavaliando, setReavaliando] = useState(false)

  // Preview ao vivo.
  const [exOrigem, setExOrigem] = useState('site')
  // Relógio congelado no mount: `Date.now()` em render torna o componente impuro.
  const [agora] = useState(() => Date.now())
  const [exValor, setExValor] = useState('1500')
  const [exDias, setExDias] = useState('2')
  const [exResp, setExResp] = useState(true)
  const [exContatos, setExContatos] = useState('1')

  const previewRef = new Date(agora - (Number(exDias) || 0) * 86400000).toISOString()
  const preview = calcularScore({
    ultima_mensagem_at: previewRef, origem: exOrigem, valor_estimado: Number(exValor) || 0,
    telefone: '1', respondeu: exResp, contatos: Number(exContatos) || 0,
  }, cfg)

  const setEng = (k: keyof ScoreConfig['engajamento'], v: number) => setCfg({ ...cfg, engajamento: { ...cfg.engajamento, [k]: v } })
  const setLim = (k: keyof ScoreConfig['limites'], v: number) => setCfg({ ...cfg, limites: { ...cfg.limites, [k]: v } })
  const setAlc = (k: keyof ScoreConfig['alcance'], v: number) => setCfg({ ...cfg, alcance: { ...cfg.alcance, [k]: v } })
  const setGat = (patch: Partial<ScoreConfig['gatilho']>) => setCfg({ ...cfg, gatilho: { ...cfg.gatilho, ...patch } })

  async function salvar() {
    setSalvando(true)
    const r = await fetch('/api/scoring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
    setSalvando(false)
    if (!r.ok) { const j = await r.json().catch(() => ({})); notify.bad('Erro ao salvar', j.error); return }
    notify.ok('Configuração de scoring salva')
  }

  async function reavaliar() {
    setReavaliando(true)
    const r = await fetch('/api/leads/pontuar', { method: 'POST' })
    setReavaliando(false)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad('Erro ao reavaliar', j.error); return }
    notify.ok('Scores reavaliados', `${j.avaliados ?? 0} leads · ${j.enfileirados ?? 0} enfileirados na cadência`)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Lead scoring" />
      <div className="mx-auto w-full max-w-[900px] min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold text-ink">Lead scoring</h1>
            <p className="mt-0.5 max-w-[560px] text-[13px] text-ink-3">
              Defina os pontos de cada sinal. O score classifica o lead (quente/morno/frio) no card e, ao cruzar o limite, pode inscrever o lead numa cadência automaticamente.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" icon={<RefreshCw size={15} strokeWidth={1.8} />} onClick={reavaliar} loading={reavaliando}>Reavaliar agora</Button>
            <Button icon={<Save size={15} strokeWidth={1.8} />} onClick={salvar} loading={salvando}>Salvar</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Secao titulo="Classificação (limite de pontos)">
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Quente a partir de" value={cfg.limites.quente} onChange={(v) => setLim('quente', v)} />
                <NumField label="Morno a partir de" value={cfg.limites.morno} onChange={(v) => setLim('morno', v)} />
              </div>
            </Secao>

            <Secao titulo="Engajamento (comportamento real)">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <NumField label="Respondeu" value={cfg.engajamento.por_resposta} onChange={(v) => setEng('por_resposta', v)} />
                <NumField label="Por contato" value={cfg.engajamento.por_contato} onChange={(v) => setEng('por_contato', v)} hint="× nº de ligações" />
                <NumField label="Máx." value={cfg.engajamento.max} onChange={(v) => setEng('max', v)} />
              </div>
            </Secao>

            <Secao titulo="Recência do último contato">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {cfg.recencia.map((b, i) => (
                  <NumField key={i} label={`≤ ${b.ate_dias}d`} value={b.pts}
                    onChange={(v) => setCfg({ ...cfg, recencia: cfg.recencia.map((x, idx) => idx === i ? { ...x, pts: v } : x) })} />
                ))}
              </div>
            </Secao>

            <Secao titulo="Valor estimado (R$)">
              <div className="space-y-2">
                {cfg.valor.map((b, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <NumField label={`Faixa ${i + 1} — a partir de`} value={b.min}
                      onChange={(v) => setCfg({ ...cfg, valor: cfg.valor.map((x, idx) => idx === i ? { ...x, min: v } : x) })} />
                    <NumField label="Pontos" value={b.pts}
                      onChange={(v) => setCfg({ ...cfg, valor: cfg.valor.map((x, idx) => idx === i ? { ...x, pts: v } : x) })} />
                  </div>
                ))}
              </div>
            </Secao>

            <Secao titulo="Origem do lead">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(cfg.origem).map(([k, v]) => (
                  <NumField key={k} label={k} value={v} onChange={(n) => setCfg({ ...cfg, origem: { ...cfg.origem, [k]: n } })} />
                ))}
                <NumField label="outras (padrão)" value={cfg.origem_padrao} onChange={(v) => setCfg({ ...cfg, origem_padrao: v })} />
              </div>
            </Secao>

            <Secao titulo="Alcance">
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Tem telefone" value={cfg.alcance.telefone} onChange={(v) => setAlc('telefone', v)} />
                <NumField label="Tem Instagram" value={cfg.alcance.instagram} onChange={(v) => setAlc('instagram', v)} />
              </div>
            </Secao>

            <Secao titulo="Gatilho de cadência">
              <label className="mb-3 flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={cfg.gatilho.ativo} onChange={(e) => setGat({ ativo: e.target.checked })} className="size-4 accent-accent" />
                Inscrever o lead numa cadência quando o score cruzar o limite
              </label>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Score mínimo" value={cfg.gatilho.score_min} onChange={(v) => setGat({ score_min: v })} />
                <Select label="Cadência" value={cfg.gatilho.cadencia_id ?? ''} onChange={(e) => setGat({ cadencia_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— selecionar —</option>
                  {cadencias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Select>
              </div>
              {cadencias.length === 0 && <p className="mt-2 text-[11px] text-ink-3">Crie uma cadência em Sistema → Cadências para usar o gatilho.</p>}
              <p className="mt-2 text-[11px] text-ink-3">A inscrição roda no botão &quot;Reavaliar agora&quot; e no processamento diário. Meta-safe: só agenda tarefas.</p>
            </Secao>
          </div>

          {/* Preview ao vivo */}
          <div className="lg:sticky lg:top-2 lg:self-start">
            <div className="rounded-card border border-line bg-card p-4">
              <div className="mb-3 flex items-center gap-2 text-[13.5px] font-semibold text-ink"><Zap size={15} strokeWidth={1.8} className="text-accent" /> Simulador</div>
              <div className="space-y-2.5">
                <Select label="Origem" value={exOrigem} onChange={(e) => setExOrigem(e.target.value)}>
                  {Object.keys(cfg.origem).map((k) => <option key={k} value={k}>{k}</option>)}
                  <option value="__outra__">outra</option>
                </Select>
                <NumField label="Valor estimado (R$)" value={Number(exValor) || 0} onChange={(v) => setExValor(String(v))} />
                <NumField label="Dias desde o último contato" value={Number(exDias) || 0} onChange={(v) => setExDias(String(v))} />
                <NumField label="Nº de contatos (ligações)" value={Number(exContatos) || 0} onChange={(v) => setExContatos(String(v))} />
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <input type="checkbox" checked={exResp} onChange={(e) => setExResp(e.target.checked)} className="size-4 accent-accent" />
                  Já respondeu
                </label>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3">
                <div className="flex items-center gap-2">
                  <Flame size={18} strokeWidth={1.8} className="text-accent" />
                  <span className="num text-[24px] font-semibold text-ink">{preview.score}</span>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${TIER_CHIP[preview.tier]}`}>
                  {preview.tier === 'quente' ? 'Quente' : preview.tier === 'morno' ? 'Morno' : 'Frio'}
                </span>
              </div>
              {cfg.gatilho.ativo && (
                <div className="mt-2 text-[11px] text-ink-3">
                  {preview.score >= cfg.gatilho.score_min
                    ? <span className="flex items-center gap-1 font-medium text-accent"><Badge tone="acc">≥ {cfg.gatilho.score_min}</Badge> entraria na cadência</span>
                    : `Abaixo do gatilho (${cfg.gatilho.score_min})`}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
