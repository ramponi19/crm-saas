'use client'
import { useState } from 'react'
import { Plus, Save, Pencil, Users, X } from 'lucide-react'
import { Card, Button, IconButton, Input, Modal, notify } from '@/components/ui'
import { textoPreco, type PrecoAdicional } from '@/lib/precos-adicionais'

interface Plano {
  id: string
  nome: string
  descricao: string | null
  preco_centavos: number
  stripe_price_id: string | null
  limite_usuarios: number
  limite_leads: number
  features: string[]
  destaque: boolean
  ativo: boolean
  ordem: number
  cor: string
}

// Roxo da plataforma (superadmin) — único toque de accent permitido aqui.
const PLATFORM = '#6D28D9'

function fmtPreco(centavos: number) {
  if (centavos === 0) return 'Grátis'
  return `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}/mês`
}

export default function PlanosAdminView({ base, antigos, itens }: { base: Plano | null; antigos: string[]; itens: PrecoAdicional[] }) {
  const [planos, setPlanos] = useState<Plano[]>(base ? [base] : [])
  const [editing, setEditing] = useState<Plano | null>(null)
  const [saving, setSaving] = useState(false)
  const [newFeature, setNewFeature] = useState('')

  function abrirEdicao(p: Plano) {
    setEditing({ ...p, features: Array.isArray(p.features) ? [...p.features] : [] })
  }

  function setField<K extends keyof Plano>(k: K, v: Plano[K]) {
    setEditing(e => e ? { ...e, [k]: v } : e)
  }

  function addFeature() {
    const f = newFeature.trim()
    if (!f || !editing) return
    setEditing(e => e ? { ...e, features: [...e.features, f] } : e)
    setNewFeature('')
  }

  function removeFeature(i: number) {
    setEditing(e => e ? { ...e, features: e.features.filter((_, idx) => idx !== i) } : e)
  }

  async function salvar() {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch('/api/superadmin/planos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, nome: editing.nome, cor: editing.cor, descricao: editing.descricao, preco_centavos: editing.preco_centavos, stripe_price_id: editing.stripe_price_id, limite_usuarios: editing.limite_usuarios, features: editing.features }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setPlanos(prev => prev.map(p => p.id === editing.id ? json.plano : p))
      setEditing(null)
      notify.ok('Plano salvo!')
    } catch (e) {
      notify.bad(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-line px-4 py-4 sm:px-8 sm:py-5">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: PLATFORM }}>Super Admin</p>
        <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Plano e preços</h1>
        <p className="mt-0.5 text-[14px] text-ink-2">Um plano base para todo mundo; o resto é módulo ou extra, com preço próprio</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6 scrollbar-thin">
        {/* Cards dos planos */}
        {planos.length === 0 && <p className="mb-8 text-[13px] text-bad">O plano base (planos_config, id base) não está no banco.</p>}
        <div className="mb-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {planos.map(p => (
            <Card key={p.id}>
              <p className="mb-2 text-[11px] font-medium text-ink-3">Plano base: o resumo do cadastro e da landing</p>

              <div className="mb-4 flex items-start justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-3 w-3 flex-none rounded-full" style={{ background: p.cor }} />
                    <h3 className="text-[17px] font-bold text-ink">{p.nome}</h3>
                  </div>
                  <p className="text-[12px] text-ink-2">{p.descricao}</p>
                </div>
                <Button size="sm" variant="outline" icon={<Pencil size={12} strokeWidth={1.7} />} onClick={() => abrirEdicao(p)}>
                  Editar
                </Button>
              </div>

              <div className="num mb-4 text-[24px] font-bold text-ink">{fmtPreco(p.preco_centavos)}</div>

              <div className="mb-4 flex gap-4 text-[12px] text-ink-2">
                <span className="flex items-center gap-1"><Users size={12} strokeWidth={1.7} /> limite de {p.limite_usuarios} usuários na empresa nova</span>
              </div>

              <ul className="space-y-1">
                {(Array.isArray(p.features) ? p.features : []).map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px] text-ink-2">
                    <span className="h-1.5 w-1.5 flex-none rounded-full bg-ink/25" />
                    {f}
                  </li>
                ))}
              </ul>

              {p.stripe_price_id && (
                <p className="num mt-3 truncate text-[11px] text-ink-3">Stripe: {p.stripe_price_id}</p>
              )}
            </Card>
          ))}
          <TabelaDePrecos itens={itens} />
        </div>
        {antigos.length > 0 && (
          <p className="text-[12px] text-ink-3">Planos antigos, inativos e guardados só para o histórico: {antigos.join(', ')}.</p>
        )}
      </div>

      {/* Modal de edição */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="md"
        disableOverlayClose={saving}
        title={editing ? <span>Editar plano <span className="num ml-1 text-[12px] font-normal text-ink-3">ID: {editing.id}</span></span> : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} loading={saving} icon={<Save size={14} strokeWidth={1.7} />} style={{ background: PLATFORM }} className="text-white hover:opacity-90">
              {saving ? 'Salvando…' : 'Salvar plano'}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            {/* Nome + Cor */}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nome" value={editing.nome} onChange={e => setField('nome', e.target.value)} />
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-ink-2">Cor (hex)</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={editing.cor}
                    onChange={e => setField('cor', e.target.value)}
                    className="h-9 w-11 flex-none cursor-pointer rounded-control border border-line bg-transparent"
                  />
                  <Input wrapperClassName="flex-1" className="num" value={editing.cor} onChange={e => setField('cor', e.target.value)} />
                </div>
              </div>
            </div>

            <Input label="Descrição" value={editing.descricao ?? ''} onChange={e => setField('descricao', e.target.value)} />

            {/* Preço + Stripe */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Preço (centavos)"
                type="number"
                min={0}
                value={editing.preco_centavos}
                onChange={e => setField('preco_centavos', Number(e.target.value))}
                hint={fmtPreco(editing.preco_centavos)}
              />
              <Input
                label="Stripe Price ID"
                className="num"
                value={editing.stripe_price_id ?? ''}
                onChange={e => setField('stripe_price_id', e.target.value || null)}
                placeholder="price_…"
              />
            </div>

            <Input
              label="Usuários incluídos"
              type="number"
              min={1}
              value={editing.limite_usuarios}
              onChange={e => setField('limite_usuarios', Number(e.target.value))}
              hint="Limite que a empresa nova recebe no cadastro"
            />

            {/* Features */}
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-2">O que inclui (o resumo do cadastro, um item por linha)</label>
              <div className="mb-2 space-y-1.5">
                {editing.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-control bg-raised px-3 py-2">
                    <span className="flex-1 text-[13px] text-ink">{f}</span>
                    <IconButton aria-label="Remover" size="sm" onClick={() => removeFeature(i)}>
                      <X size={13} strokeWidth={1.7} />
                    </IconButton>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  wrapperClassName="flex-1"
                  value={newFeature}
                  onChange={e => setNewFeature(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature() } }}
                  placeholder="Novo item…"
                />
                <Button icon={<Plus size={14} strokeWidth={1.7} />} onClick={addFeature} style={{ background: PLATFORM }} className="text-white hover:opacity-90" aria-label="Adicionar" />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/** Preço de cada extra e de cada módulo da Central; vazio = "a definir". Salva linha por linha. */
function TabelaDePrecos({ itens }: { itens: PrecoAdicional[] }) {
  const [linhas, setLinhas] = useState(itens)
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)

  async function salvar(chave: string) {
    const texto = (rascunho[chave] ?? '').trim().replace(/\./g, '').replace(',', '.')
    const reais = texto === '' ? null : Number(texto)
    if (reais !== null && (!Number.isFinite(reais) || reais < 0)) { notify.bad('Preço inválido'); return }
    setSalvando(chave)
    const res = await fetch('/api/superadmin/precos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave, preco_centavos: reais === null ? null : Math.round(reais * 100) }),
    })
    const json = await res.json().catch(() => ({}))
    setSalvando(null)
    if (!res.ok) { notify.bad(json.error ?? 'Erro ao salvar'); return }
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, preco_centavos: json.preco.preco_centavos } : l)))
    setRascunho((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== chave)))
    notify.ok('Preço salvo')
  }

  const grupo = (tipo: PrecoAdicional['tipo'], titulo: string) => (
    <div className="mb-4">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{titulo}</p>
      <div className="divide-y divide-line-soft rounded-control border border-line">
        {linhas.filter((l) => l.tipo === tipo).map((l) => (
          <div key={l.chave} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-ink">{l.nome}</p>
              <p className="text-[11px] text-ink-3">{textoPreco(l.preco_centavos)}{l.preco_centavos != null ? ` · ${l.unidade}` : ''}</p>
            </div>
            <Input
              aria-label={`Preço de ${l.nome} em reais`}
              wrapperClassName="w-[110px]"
              className="num"
              inputMode="decimal"
              placeholder={l.preco_centavos == null ? 'R$' : (l.preco_centavos / 100).toLocaleString('pt-BR')}
              value={rascunho[l.chave] ?? ''}
              onChange={(e) => setRascunho((r) => ({ ...r, [l.chave]: e.target.value }))}
            />
            <Button size="sm" variant="outline" disabled={!(l.chave in rascunho)} loading={salvando === l.chave} onClick={() => salvar(l.chave)}>Salvar</Button>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <Card>
      <h3 className="text-[15px] font-semibold text-ink">Preços de módulos e extras</h3>
      <p className="mb-4 mt-0.5 text-[12px] text-ink-2">Em reais por mês. Campo vazio e salvo = “a definir”.</p>
      {grupo('extra', 'Extras')}
      {grupo('modulo', 'Módulos da Central')}
    </Card>
  )
}
