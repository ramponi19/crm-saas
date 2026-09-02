'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Target, Loader2, ExternalLink, Save } from 'lucide-react'
import { Input, Select, Button, Badge, notify } from '@/components/ui'
import type { MatchResultado } from '@/lib/match-imoveis'

const TIPOS = ['apartamento', 'casa', 'terreno', 'comercial', 'sala', 'galpao', 'cobertura', 'sitio']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))

const vazio = {
  finalidade: 'venda', tipos: [] as string[], cidades: '', bairros: '',
  preco_min: '', preco_max: '', quartos_min: '', vagas_min: '',
}

export function LeadMatchPanel({ leadId }: { leadId: number }) {
  const supabase = createClient()
  const { resolverEmpresaId } = useEmpresa()
  const [form, setForm] = useState(vazio)
  const [salvando, setSalvando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [matches, setMatches] = useState<MatchResultado[]>([])
  const [carregou, setCarregou] = useState(false)

  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const arr = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)

  const buscar = useCallback(async () => {
    setBuscando(true)
    try {
      const res = await fetch(`/api/match/lead/${leadId}`)
      const data = await res.json()
      setMatches(Array.isArray(data.matches) ? data.matches : [])
    } catch { /* ignora */ }
    setBuscando(false)
  }, [leadId])

  useEffect(() => {
    supabase.from('lead_perfil_busca')
      .select('finalidade, tipos, cidades, bairros, preco_min, preco_max, quartos_min, vagas_min')
      .eq('lead_id', leadId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setForm({
            finalidade: data.finalidade ?? 'venda',
            tipos: data.tipos ?? [],
            cidades: (data.cidades ?? []).join(', '),
            bairros: (data.bairros ?? []).join(', '),
            preco_min: data.preco_min?.toString() ?? '',
            preco_max: data.preco_max?.toString() ?? '',
            quartos_min: data.quartos_min?.toString() ?? '',
            vagas_min: data.vagas_min?.toString() ?? '',
          })
          buscar()
        }
        setCarregou(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  const toggleTipo = (t: string) =>
    setForm(f => ({ ...f, tipos: f.tipos.includes(t) ? f.tipos.filter(x => x !== t) : [...f.tipos, t] }))

  async function salvar() {
    const empresaId = await resolverEmpresaId()
    if (!empresaId) { notify.bad('Não foi possível identificar a empresa', 'Recarregue a página e tente de novo.'); return }
    setSalvando(true)
    const { error } = await supabase.from('lead_perfil_busca').upsert({
      empresa_id: empresaId,
      lead_id: leadId,
      finalidade: form.finalidade,
      tipos: form.tipos,
      cidades: arr(form.cidades),
      bairros: arr(form.bairros),
      preco_min: num(form.preco_min),
      preco_max: num(form.preco_max),
      quartos_min: num(form.quartos_min),
      vagas_min: num(form.vagas_min),
    }, { onConflict: 'lead_id' })
    setSalvando(false)
    if (error) { notify.bad(error.message); return }
    notify.ok('Perfil salvo — buscando imóveis compatíveis…')
    buscar()
  }

  if (!carregou) return <div className="p-4 text-[13px] text-ink-3"><Loader2 size={15} strokeWidth={1.7} className="animate-spin inline mr-2" />Carregando perfil…</div>

  return (
    <div className="border-t border-line-soft pt-4 mt-1">
      <div className="flex items-center gap-2 mb-3">
        <Target size={16} strokeWidth={1.7} className="text-accent" />
        <span className="text-[13.5px] font-semibold text-ink">Perfil de busca &amp; Match</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <div className="col-span-2">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Tipos de imóvel</span>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map(t => (
              <button key={t} type="button" onClick={() => toggleTipo(t)}
                className={`px-2.5 py-1 rounded-full text-[11.5px] border transition-colors ${form.tipos.includes(t) ? 'border-accent bg-accent-soft text-accent font-semibold' : 'border-line text-ink-3 hover:border-line'}`}>
                {cap(t)}
              </button>
            ))}
          </div>
        </div>
        <Select label="Finalidade" value={form.finalidade} onChange={e => setForm(f => ({ ...f, finalidade: e.target.value }))}>
          <option value="venda">Venda</option><option value="locacao">Locação</option>
        </Select>
        <Input label="Cidades (vírgula)" value={form.cidades} onChange={e => setForm(f => ({ ...f, cidades: e.target.value }))} placeholder="Ex: Curitiba" />
        <Input label="Bairros (vírgula)" wrapperClassName="col-span-2" value={form.bairros} onChange={e => setForm(f => ({ ...f, bairros: e.target.value }))} placeholder="Ex: Centro, Batel" />
        <Input label="Preço mín" type="number" className="num" value={form.preco_min} onChange={e => setForm(f => ({ ...f, preco_min: e.target.value }))} />
        <Input label="Preço máx" type="number" className="num" value={form.preco_max} onChange={e => setForm(f => ({ ...f, preco_max: e.target.value }))} />
        <Input label="Quartos (mín)" type="number" className="num" value={form.quartos_min} onChange={e => setForm(f => ({ ...f, quartos_min: e.target.value }))} />
        <Input label="Vagas (mín)" type="number" className="num" value={form.vagas_min} onChange={e => setForm(f => ({ ...f, vagas_min: e.target.value }))} />
      </div>

      <Button className="w-full mb-3" onClick={salvar} loading={salvando} icon={<Save size={15} strokeWidth={1.7} />}>
        Salvar perfil e buscar match
      </Button>

      {/* Resultados */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11.5px] font-semibold text-ink-2">Imóveis compatíveis {matches.length > 0 && <span className="num">({matches.length})</span>}</span>
          {buscando && <Loader2 size={13} strokeWidth={1.7} className="animate-spin text-ink-3" />}
        </div>
        {matches.length === 0 && !buscando ? (
          <p className="text-[12px] text-ink-3 py-2">Nenhum imóvel compatível ainda. Ajuste o perfil ou cadastre mais imóveis.</p>
        ) : (
          <div className="space-y-1.5">
            {matches.map(({ imovel, score }) => (
              <a key={imovel.id} href={`/imovel/${imovel.id}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-2 rounded-control border border-line hover:border-accent hover:bg-raised transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink truncate">{imovel.titulo || cap(imovel.tipo)} {imovel.codigo && <span className="text-ink-3 font-normal">· {imovel.codigo}</span>}</div>
                  <div className="text-[11px] text-ink-3 truncate">{[imovel.bairro, imovel.cidade].filter(Boolean).join(', ') || cap(imovel.tipo)} · <span className="num">{brl(imovel.valor_venda ?? imovel.valor_locacao)}</span></div>
                </div>
                <Badge tone={score >= 70 ? 'ok' : 'acc'} className="num shrink-0">{score}%</Badge>
                <ExternalLink size={13} strokeWidth={1.7} className="text-ink-3 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
