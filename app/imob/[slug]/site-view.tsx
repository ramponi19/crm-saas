'use client'

import { useState, useMemo } from 'react'
import { BedDouble, Car, Ruler, MapPin, MessageCircle, Search, SlidersHorizontal } from 'lucide-react'
import { EmptyState } from '@/components/ui'

type Imovel = {
  id: number; codigo: string | null; titulo: string | null; tipo: string; finalidade: string
  status: string; bairro: string | null; cidade: string | null; uf: string | null
  valor_venda: number | null; valor_locacao: number | null
  quartos: number | null; banheiros: number | null; vagas: number | null; area_util: number | null
  fotos: unknown
}
type Empresa = {
  nome: string; wl_cor: string | null; wl_logo_url: string | null
  wl_slogan: string | null; wl_whatsapp: string | null; telefone: string | null
}

const brl = (v: number | null) => (v == null ? null : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const foto0 = (f: unknown) => (Array.isArray(f) && f[0] ? (f[0] as string) : null)

export default function SiteView({ empresa, imoveis }: { empresa: Empresa; imoveis: Imovel[] }) {
  const cor = empresa.wl_cor || '#2E5CE6'
  const zap = (empresa.wl_whatsapp || empresa.telefone || '').replace(/\D/g, '')

  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [finalidade, setFinalidade] = useState('')
  const [cidade, setCidade] = useState('')
  const [precoMax, setPrecoMax] = useState('')
  const [quartosMin, setQuartosMin] = useState('')

  const tipos = useMemo(() => Array.from(new Set(imoveis.map(i => i.tipo))).sort(), [imoveis])
  const cidades = useMemo(() => Array.from(new Set(imoveis.map(i => i.cidade).filter(Boolean) as string[])).sort(), [imoveis])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const pMax = precoMax ? Number(precoMax) : null
    const qMin = quartosMin ? Number(quartosMin) : null
    return imoveis.filter(im => {
      if (tipo && im.tipo !== tipo) return false
      if (finalidade && im.finalidade !== finalidade && im.finalidade !== 'ambos') return false
      if (cidade && im.cidade !== cidade) return false
      if (qMin != null && (im.quartos ?? 0) < qMin) return false
      if (pMax != null) {
        const preco = im.valor_venda ?? im.valor_locacao ?? Infinity
        if (preco > pMax) return false
      }
      if (q) {
        const hay = `${im.titulo ?? ''} ${im.codigo ?? ''} ${im.bairro ?? ''} ${im.cidade ?? ''} ${im.tipo}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [imoveis, busca, tipo, finalidade, cidade, precoMax, quartosMin])

  const sel = 'rounded-control border border-line bg-card px-3 py-2.5 text-[13.5px] text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30'

  return (
    <main className="min-h-screen bg-bg font-sans text-ink antialiased">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {empresa.wl_logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={empresa.wl_logo_url} alt={empresa.nome} className="h-9 w-auto object-contain" />
              : <span className="text-[19px] font-bold tracking-[-0.02em]" style={{ color: cor }}>{empresa.nome}</span>}
            {empresa.wl_slogan && <span className="hidden truncate border-l border-line pl-3 text-[13px] text-ink-2 md:block">{empresa.wl_slogan}</span>}
          </div>
          {zap && (
            <a href={`https://wa.me/55${zap}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-2 rounded-control bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink/90">
              <MessageCircle size={16} strokeWidth={1.7} /> WhatsApp
            </a>
          )}
        </div>
      </header>

      {/* Hero + busca */}
      <section className="mx-auto max-w-[1180px] px-5 pb-6 pt-10">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em] md:text-[38px]">Encontre seu próximo imóvel</h1>
        <p className="mb-6 mt-1.5 text-[15px] text-ink-2">{imoveis.length} imóve{imoveis.length === 1 ? 'l' : 'is'} disponíve{imoveis.length === 1 ? 'l' : 'is'} na {empresa.nome}.</p>

        {/* Filtros */}
        <div className="rounded-card border border-line bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-ink-3"><SlidersHorizontal size={14} strokeWidth={1.7} /> Filtrar</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <div className="relative col-span-2 md:col-span-2">
              <Search size={15} strokeWidth={1.7} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar bairro, código…" className={`${sel} w-full pl-9`} />
            </div>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={sel}>
              <option value="">Tipo</option>
              {tipos.map(t => <option key={t} value={t}>{cap(t)}</option>)}
            </select>
            <select value={finalidade} onChange={e => setFinalidade(e.target.value)} className={sel}>
              <option value="">Venda/Locação</option>
              <option value="venda">Venda</option>
              <option value="locacao">Locação</option>
            </select>
            <select value={cidade} onChange={e => setCidade(e.target.value)} className={sel}>
              <option value="">Cidade</option>
              {cidades.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={quartosMin} onChange={e => setQuartosMin(e.target.value)} className={sel}>
              <option value="">Quartos</option>
              {[1, 2, 3, 4].map(q => <option key={q} value={q}>{q}+ quartos</option>)}
            </select>
            <input type="number" value={precoMax} onChange={e => setPrecoMax(e.target.value)} placeholder="Preço até" className={`${sel} col-span-2 md:col-span-1`} />
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-[1180px] px-5 pb-16">
        {filtrados.length === 0 ? (
          <EmptyState
            icon={<Search size={22} strokeWidth={1.7} />}
            title="Nenhum imóvel encontrado"
            description="Ajuste os filtros para ver mais opções."
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtrados.map(im => {
              const capa = foto0(im.fotos)
              return (
                <a key={im.id} href={`/imovel/${im.id}`} className="group overflow-hidden rounded-card border border-line bg-card transition-colors hover:border-ink/20">
                  <div className="relative h-[190px] bg-line-soft">
                    {capa
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={capa} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      : <div className="flex h-full w-full items-center justify-center text-[13px] text-ink-3">Sem foto</div>}
                    <span className="absolute left-3 top-3 rounded-[6px] px-2 py-1 text-[10.5px] font-semibold text-white" style={{ background: cor }}>
                      {im.finalidade === 'locacao' ? 'Locação' : im.finalidade === 'ambos' ? 'Venda/Locação' : 'Venda'}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="font-mono text-[10px] text-ink-3">{im.codigo || cap(im.tipo)}</div>
                    <div className="truncate text-[15.5px] font-semibold tracking-[-0.01em]">{im.titulo || cap(im.tipo)}</div>
                    <div className="mb-3 mt-0.5 flex items-center gap-1 text-[12.5px] text-ink-2">
                      <MapPin size={13} strokeWidth={1.7} style={{ color: cor }} /> {[im.bairro, im.cidade].filter(Boolean).join(', ') || 'Endereço sob consulta'}
                    </div>
                    <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
                      {im.quartos ? <span className="inline-flex items-center gap-1"><BedDouble size={14} strokeWidth={1.7} /> {im.quartos}</span> : null}
                      {im.vagas ? <span className="inline-flex items-center gap-1"><Car size={14} strokeWidth={1.7} /> {im.vagas}</span> : null}
                      {im.area_util ? <span className="inline-flex items-center gap-1"><Ruler size={14} strokeWidth={1.7} /> {im.area_util}m²</span> : null}
                    </div>
                    <div className="text-[18px] font-bold tracking-[-0.02em] tabular-nums">{brl(im.valor_venda ?? im.valor_locacao) ?? 'Sob consulta'}{im.valor_venda == null && im.valor_locacao != null ? <span className="text-[12px] font-medium text-ink-2">/mês</span> : null}</div>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </section>

      <footer className="pb-8 text-center text-[12px] text-ink-3">
        {empresa.nome} · powered by Nexus
      </footer>
    </main>
  )
}
