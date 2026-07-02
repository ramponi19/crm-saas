'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Target, Loader2, ExternalLink, Save } from 'lucide-react'
import { toast } from 'sonner'
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
  const { empresa } = useEmpresa()
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
    if (!empresa?.id) { toast.error('Empresa não carregada'); return }
    setSalvando(true)
    const { error } = await supabase.from('lead_perfil_busca').upsert({
      empresa_id: empresa.id,
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
    if (error) { toast.error(error.message); return }
    toast.success('Perfil salvo — buscando imóveis compatíveis…')
    buscar()
  }

  const inp = 'w-full bg-[rgba(22,32,46,.04)] border border-[rgba(22,32,46,.12)] rounded-[9px] px-2.5 py-2 text-[13px] text-[#16212E] outline-none focus:border-[rgba(22,32,46,.35)]'
  const lbl = 'block font-mono text-[9.5px] tracking-[0.1em] text-[#788698] mb-1'

  if (!carregou) return <div className="p-4 text-[13px] text-[#788698]"><Loader2 size={15} className="animate-spin inline mr-2" />Carregando perfil…</div>

  return (
    <div className="border-t border-[#16212E]/[0.08] pt-4 mt-1">
      <div className="flex items-center gap-2 mb-3">
        <Target size={16} className="text-[#C9A24B]" />
        <span className="text-[13.5px] font-bold text-[#16212E]">Perfil de busca &amp; Match</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <div className="col-span-2">
          <label className={lbl}>TIPOS DE IMÓVEL</label>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map(t => (
              <button key={t} type="button" onClick={() => toggleTipo(t)}
                className={`px-2.5 py-1 rounded-full text-[11.5px] border transition-all ${form.tipos.includes(t) ? 'border-[#C9A24B] bg-[#C9A24B]/10 text-[#8A6D2B] font-semibold' : 'border-[#16212E]/15 text-[#788698]'}`}>
                {cap(t)}
              </button>
            ))}
          </div>
        </div>
        <div><label className={lbl}>FINALIDADE</label>
          <select value={form.finalidade} onChange={e => setForm(f => ({ ...f, finalidade: e.target.value }))} className={inp}>
            <option value="venda">Venda</option><option value="locacao">Locação</option>
          </select></div>
        <div><label className={lbl}>CIDADES (vírgula)</label>
          <input value={form.cidades} onChange={e => setForm(f => ({ ...f, cidades: e.target.value }))} className={inp} placeholder="Ex: Curitiba" /></div>
        <div className="col-span-2"><label className={lbl}>BAIRROS (vírgula)</label>
          <input value={form.bairros} onChange={e => setForm(f => ({ ...f, bairros: e.target.value }))} className={inp} placeholder="Ex: Centro, Batel" /></div>
        <div><label className={lbl}>PREÇO MÍN</label>
          <input type="number" value={form.preco_min} onChange={e => setForm(f => ({ ...f, preco_min: e.target.value }))} className={inp} /></div>
        <div><label className={lbl}>PREÇO MÁX</label>
          <input type="number" value={form.preco_max} onChange={e => setForm(f => ({ ...f, preco_max: e.target.value }))} className={inp} /></div>
        <div><label className={lbl}>QUARTOS (mín)</label>
          <input type="number" value={form.quartos_min} onChange={e => setForm(f => ({ ...f, quartos_min: e.target.value }))} className={inp} /></div>
        <div><label className={lbl}>VAGAS (mín)</label>
          <input type="number" value={form.vagas_min} onChange={e => setForm(f => ({ ...f, vagas_min: e.target.value }))} className={inp} /></div>
      </div>

      <button onClick={salvar} disabled={salvando}
        className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-[10px] text-[13px] font-semibold text-white bg-[#16212E] hover:bg-[#22303f] disabled:opacity-60 mb-3">
        {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : <><Save size={14} /> Salvar perfil e buscar match</>}
      </button>

      {/* Resultados */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11.5px] font-semibold text-[#56657A]">🎯 Imóveis compatíveis {matches.length > 0 && `(${matches.length})`}</span>
          {buscando && <Loader2 size={13} className="animate-spin text-[#788698]" />}
        </div>
        {matches.length === 0 && !buscando ? (
          <p className="text-[12px] text-[#9AA7B6] py-2">Nenhum imóvel compatível ainda. Ajuste o perfil ou cadastre mais imóveis.</p>
        ) : (
          <div className="space-y-1.5">
            {matches.map(({ imovel, score }) => (
              <a key={imovel.id} href={`/imovel/${imovel.id}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-2 rounded-[9px] border border-[#16212E]/[0.08] hover:border-[#C9A24B]/50 hover:bg-[#16212E]/[0.015] transition-all">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-[#16212E] truncate">{imovel.titulo || cap(imovel.tipo)} {imovel.codigo && <span className="text-[#9AA7B6] font-normal">· {imovel.codigo}</span>}</div>
                  <div className="text-[11px] text-[#788698] truncate">{[imovel.bairro, imovel.cidade].filter(Boolean).join(', ') || cap(imovel.tipo)} · {brl(imovel.valor_venda ?? imovel.valor_locacao)}</div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: score >= 70 ? '#16A34A18' : '#C9A24B18', color: score >= 70 ? '#16A34A' : '#8A6D2B' }}>{score}%</span>
                <ExternalLink size={13} className="text-[#B0BCC9] shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
