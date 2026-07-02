'use client'

import { useState, useMemo } from 'react'
import { BedDouble, Car, Ruler, MapPin, MessageCircle, Search, SlidersHorizontal } from 'lucide-react'

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
  const cor = empresa.wl_cor || '#C9A24B'
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

  const sel = 'bg-white border border-[#141E2C]/[0.12] rounded-[10px] px-3 py-2.5 text-[13.5px] text-[#141E2C] outline-none focus:border-[#141E2C]/35'

  return (
    <main style={{ background: '#F7F4EC', minHeight: '100vh' }} className="text-[#141E2C]">
      {/* Header */}
      <header className="border-b border-[#141E2C]/[0.08] bg-white/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1180px] mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {empresa.wl_logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={empresa.wl_logo_url} alt={empresa.nome} className="h-9 w-auto object-contain" />
              : <span className="font-extrabold text-[19px]" style={{ color: cor }}>{empresa.nome}</span>}
            {empresa.wl_slogan && <span className="hidden md:block text-[13px] text-[#788698] border-l border-[#141E2C]/10 pl-3 truncate">{empresa.wl_slogan}</span>}
          </div>
          {zap && (
            <a href={`https://wa.me/55${zap}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13.5px] font-semibold text-white shrink-0" style={{ background: '#25D366' }}>
              <MessageCircle size={16} /> WhatsApp
            </a>
          )}
        </div>
      </header>

      {/* Hero + busca */}
      <section className="max-w-[1180px] mx-auto px-5 pt-10 pb-6">
        <h1 className="text-[30px] md:text-[38px] font-extrabold leading-tight">Encontre seu próximo imóvel</h1>
        <p className="text-[15px] text-[#566072] mt-1 mb-6">{imoveis.length} imóve{imoveis.length === 1 ? 'l' : 'is'} disponíve{imoveis.length === 1 ? 'l' : 'is'} na {empresa.nome}.</p>

        {/* Filtros */}
        <div className="bg-white rounded-[16px] border border-[#141E2C]/[0.08] p-3 shadow-[0_10px_30px_rgba(22,35,50,.06)]">
          <div className="flex items-center gap-2 mb-2 text-[12px] font-semibold text-[#788698]"><SlidersHorizontal size={14} /> Filtrar</div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <div className="col-span-2 md:col-span-2 relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA7B6]" />
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
      <section className="max-w-[1180px] mx-auto px-5 pb-16">
        {filtrados.length === 0 ? (
          <div className="text-center py-20 text-[#788698]">Nenhum imóvel encontrado com esses filtros.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtrados.map(im => {
              const capa = foto0(im.fotos)
              return (
                <a key={im.id} href={`/imovel/${im.id}`} className="group bg-white rounded-[16px] border border-[#141E2C]/[0.08] overflow-hidden hover:shadow-[0_16px_40px_rgba(22,35,50,.12)] transition-shadow">
                  <div className="h-[190px] bg-[#141E2C]/[0.05] relative">
                    {capa
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={capa} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                      : <div className="w-full h-full flex items-center justify-center text-[#B0BCC9] text-[13px]">Sem foto</div>}
                    <span className="absolute top-3 left-3 text-[10.5px] font-semibold px-2 py-1 rounded-full text-white" style={{ background: cor }}>
                      {im.finalidade === 'locacao' ? 'Locação' : im.finalidade === 'ambos' ? 'Venda/Locação' : 'Venda'}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="text-[10px] font-mono text-[#9AA7B6]">{im.codigo || cap(im.tipo)}</div>
                    <div className="text-[15.5px] font-bold truncate">{im.titulo || cap(im.tipo)}</div>
                    <div className="flex items-center gap-1 text-[12.5px] text-[#788698] mt-0.5 mb-3">
                      <MapPin size={13} style={{ color: cor }} /> {[im.bairro, im.cidade].filter(Boolean).join(', ') || 'Endereço sob consulta'}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#56607A] mb-3">
                      {im.quartos ? <span className="inline-flex items-center gap-1"><BedDouble size={14} /> {im.quartos}</span> : null}
                      {im.vagas ? <span className="inline-flex items-center gap-1"><Car size={14} /> {im.vagas}</span> : null}
                      {im.area_util ? <span className="inline-flex items-center gap-1"><Ruler size={14} /> {im.area_util}m²</span> : null}
                    </div>
                    <div className="text-[18px] font-extrabold">{brl(im.valor_venda ?? im.valor_locacao) ?? 'Sob consulta'}{im.valor_venda == null && im.valor_locacao != null ? <span className="text-[12px] font-medium text-[#788698]">/mês</span> : null}</div>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </section>

      <footer className="text-center text-[12px] text-[#788698] pb-8">
        {empresa.nome} · powered by ÁPICE
      </footer>
    </main>
  )
}
