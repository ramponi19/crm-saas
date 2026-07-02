import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { BedDouble, Bath, Car, Ruler, MapPin, MessageCircle } from 'lucide-react'

const brl = (v: number | null) =>
  v == null ? null : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

async function getImovel(id: number) {
  const svc = createServiceClient()
  const { data: imovel } = await svc.from('imoveis').select('*').eq('id', id).single()
  if (!imovel) return null
  const { data: empresa } = await svc
    .from('empresas')
    .select('nome, wl_cor, wl_logo_url, wl_whatsapp, telefone')
    .eq('id', imovel.empresa_id)
    .single()
  return { imovel, empresa }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const data = await getImovel(Number(id))
  if (!data) return { title: 'Imóvel não encontrado' }
  const t = data.imovel.titulo || cap(data.imovel.tipo)
  return { title: `${t} · ${data.empresa?.nome ?? 'Imóvel'}` }
}

export default async function ImovelPublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const imovelId = Number(id)
  if (!Number.isFinite(imovelId)) notFound()

  const data = await getImovel(imovelId)
  if (!data) notFound()
  const { imovel, empresa } = data

  const cor = empresa?.wl_cor || '#C9A24B'
  const fotos = Array.isArray(imovel.fotos) ? (imovel.fotos as string[]) : []
  const zap = (empresa?.wl_whatsapp || empresa?.telefone || '').replace(/\D/g, '')
  const msg = encodeURIComponent(`Olá! Tenho interesse no imóvel ${imovel.codigo ? `(${imovel.codigo}) ` : ''}${imovel.titulo || cap(imovel.tipo)}.`)

  const enderecoLinha = [
    imovel.logradouro,
    imovel.ocultar_numero_publico ? null : imovel.numero,
    imovel.bairro,
    imovel.cidade && imovel.uf ? `${imovel.cidade}/${imovel.uf}` : imovel.cidade,
  ].filter(Boolean).join(', ')

  const specs = [
    imovel.quartos ? { icon: BedDouble, label: `${imovel.quartos} quarto${imovel.quartos > 1 ? 's' : ''}` } : null,
    imovel.banheiros ? { icon: Bath, label: `${imovel.banheiros} banheiro${imovel.banheiros > 1 ? 's' : ''}` } : null,
    imovel.vagas ? { icon: Car, label: `${imovel.vagas} vaga${imovel.vagas > 1 ? 's' : ''}` } : null,
    imovel.area_util ? { icon: Ruler, label: `${imovel.area_util} m²` } : null,
  ].filter(Boolean) as { icon: typeof BedDouble; label: string }[]

  return (
    <main style={{ background: '#F7F4EC', minHeight: '100vh' }} className="text-[#141E2C]">
      {/* header empresa */}
      <header className="max-w-[980px] mx-auto px-5 py-5 flex items-center gap-3">
        {empresa?.wl_logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={empresa.wl_logo_url} alt={empresa?.nome ?? ''} className="h-9 w-auto object-contain" />
          : <div className="font-extrabold text-[18px]" style={{ color: cor }}>{empresa?.nome ?? 'Imobiliária'}</div>}
      </header>

      <div className="max-w-[980px] mx-auto px-5 pb-16">
        {/* galeria */}
        {fotos.length > 0 ? (
          <div className="grid grid-cols-4 grid-rows-2 gap-2 rounded-[18px] overflow-hidden h-[420px] mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotos[0]} alt="" className="col-span-2 row-span-2 w-full h-full object-cover" />
            {fotos.slice(1, 5).map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={u} alt="" className="w-full h-full object-cover" />
            ))}
          </div>
        ) : (
          <div className="h-[280px] rounded-[18px] bg-[#141E2C]/[0.05] flex items-center justify-center text-[#788698] mb-6">
            Sem fotos disponíveis
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* conteúdo */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-mono tracking-wide px-2.5 py-1 rounded-full" style={{ background: `${cor}1F`, color: '#8A6D2B' }}>{cap(imovel.tipo)}</span>
              <span className="text-[11px] font-mono tracking-wide px-2.5 py-1 rounded-full bg-[#141E2C]/[0.06]" style={{ color: '#566072' }}>
                {imovel.finalidade === 'ambos' ? 'Venda e Locação' : cap(imovel.finalidade)}
              </span>
            </div>
            <h1 className="text-[28px] font-extrabold leading-tight mb-2">{imovel.titulo || cap(imovel.tipo)}</h1>
            {enderecoLinha && (
              <div className="flex items-center gap-1.5 text-[14px] text-[#566072] mb-5">
                <MapPin size={16} style={{ color: cor }} /> {enderecoLinha}
              </div>
            )}

            {specs.length > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-2 py-4 border-y border-[#141E2C]/[0.08] mb-5">
                {specs.map((s, i) => {
                  const Icon = s.icon
                  return <span key={i} className="inline-flex items-center gap-2 text-[14px] text-[#141E2C]"><Icon size={18} style={{ color: cor }} /> {s.label}</span>
                })}
              </div>
            )}

            {imovel.descricao && (
              <div className="mb-5">
                <h2 className="text-[16px] font-bold mb-2">Descrição</h2>
                <p className="text-[14.5px] leading-relaxed text-[#3C4654] whitespace-pre-line">{imovel.descricao}</p>
              </div>
            )}

            {(imovel.valor_condominio || imovel.valor_iptu || imovel.matricula) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[13.5px]">
                {imovel.valor_condominio ? <div className="bg-white rounded-[12px] p-3 border border-[#141E2C]/[0.07]"><div className="text-[#788698] text-[11px]">Condomínio</div><div className="font-bold">{brl(imovel.valor_condominio)}</div></div> : null}
                {imovel.valor_iptu ? <div className="bg-white rounded-[12px] p-3 border border-[#141E2C]/[0.07]"><div className="text-[#788698] text-[11px]">IPTU ({imovel.iptu_periodicidade})</div><div className="font-bold">{brl(imovel.valor_iptu)}</div></div> : null}
                {imovel.area_total ? <div className="bg-white rounded-[12px] p-3 border border-[#141E2C]/[0.07]"><div className="text-[#788698] text-[11px]">Área total</div><div className="font-bold">{imovel.area_total} m²</div></div> : null}
              </div>
            )}
          </div>

          {/* card lateral: preço + CTA */}
          <aside className="lg:sticky lg:top-6 self-start">
            <div className="bg-white rounded-[18px] border border-[#141E2C]/[0.08] p-6 shadow-[0_14px_40px_rgba(22,35,50,.08)]">
              {imovel.valor_venda ? (
                <><div className="text-[12px] text-[#788698]">Valor de venda</div>
                <div className="text-[26px] font-extrabold mb-3" style={{ color: '#141E2C' }}>{brl(imovel.valor_venda)}</div></>
              ) : null}
              {imovel.valor_locacao ? (
                <><div className="text-[12px] text-[#788698]">Locação</div>
                <div className="text-[20px] font-extrabold mb-3">{brl(imovel.valor_locacao)}<span className="text-[13px] font-medium text-[#788698]">/mês</span></div></>
              ) : null}
              {!imovel.valor_venda && !imovel.valor_locacao && <div className="text-[15px] font-semibold mb-3">Sob consulta</div>}

              {zap ? (
                <a href={`https://wa.me/55${zap}?text=${msg}`} target="_blank" rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-[12px] font-semibold text-white transition-transform hover:scale-[1.02]"
                  style={{ background: '#25D366' }}>
                  <MessageCircle size={18} /> Falar no WhatsApp
                </a>
              ) : (
                <div className="text-[13px] text-[#788698] text-center">Entre em contato com a {empresa?.nome ?? 'imobiliária'}.</div>
              )}
              {imovel.codigo && <div className="text-center text-[11px] font-mono text-[#9AA7B6] mt-3">Cód. {imovel.codigo}</div>}
            </div>
          </aside>
        </div>
      </div>

      <footer className="text-center text-[12px] text-[#788698] pb-8">
        {empresa?.nome} · powered by ÁPICE
      </footer>
    </main>
  )
}
