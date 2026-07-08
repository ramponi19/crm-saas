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

  const cor = empresa?.wl_cor || '#2E5CE6'
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
    <main className="min-h-screen bg-bg font-sans text-ink antialiased">
      {/* header empresa */}
      <header className="mx-auto flex max-w-[980px] items-center gap-3 border-b border-line px-5 py-5">
        {empresa?.wl_logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={empresa.wl_logo_url} alt={empresa?.nome ?? ''} className="h-9 w-auto object-contain" />
          : <div className="text-[18px] font-bold tracking-[-0.02em]" style={{ color: cor }}>{empresa?.nome ?? 'Imobiliária'}</div>}
      </header>

      <div className="mx-auto max-w-[980px] px-5 pb-16 pt-6">
        {/* galeria */}
        {fotos.length > 0 ? (
          <div className="mb-6 grid h-[420px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotos[0]} alt="" className="col-span-2 row-span-2 h-full w-full object-cover" />
            {fotos.slice(1, 5).map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={u} alt="" className="h-full w-full object-cover" />
            ))}
          </div>
        ) : (
          <div className="mb-6 flex h-[280px] items-center justify-center rounded-card bg-line-soft text-[14px] text-ink-3">
            Sem fotos disponíveis
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* conteúdo */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-[6px] px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em] text-white" style={{ background: cor }}>{cap(imovel.tipo)}</span>
              <span className="rounded-[6px] bg-ink/[0.05] px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em] text-ink-2">
                {imovel.finalidade === 'ambos' ? 'Venda e Locação' : cap(imovel.finalidade)}
              </span>
            </div>
            <h1 className="mb-2 text-[28px] font-bold leading-tight tracking-[-0.03em]">{imovel.titulo || cap(imovel.tipo)}</h1>
            {enderecoLinha && (
              <div className="mb-5 flex items-center gap-1.5 text-[14px] text-ink-2">
                <MapPin size={16} strokeWidth={1.7} style={{ color: cor }} /> {enderecoLinha}
              </div>
            )}

            {specs.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 border-y border-line py-4">
                {specs.map((s, i) => {
                  const Icon = s.icon
                  return <span key={i} className="inline-flex items-center gap-2 text-[14px] text-ink"><Icon size={18} strokeWidth={1.7} style={{ color: cor }} /> {s.label}</span>
                })}
              </div>
            )}

            {imovel.descricao && (
              <div className="mb-5">
                <h2 className="mb-2 text-[16px] font-semibold tracking-[-0.02em]">Descrição</h2>
                <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-ink-2">{imovel.descricao}</p>
              </div>
            )}

            {(imovel.valor_condominio || imovel.valor_iptu || imovel.matricula) && (
              <div className="grid grid-cols-2 gap-3 text-[13.5px] sm:grid-cols-3">
                {imovel.valor_condominio ? <div className="rounded-card border border-line bg-card p-3"><div className="text-[11px] text-ink-3">Condomínio</div><div className="font-semibold tabular-nums">{brl(imovel.valor_condominio)}</div></div> : null}
                {imovel.valor_iptu ? <div className="rounded-card border border-line bg-card p-3"><div className="text-[11px] text-ink-3">IPTU ({imovel.iptu_periodicidade})</div><div className="font-semibold tabular-nums">{brl(imovel.valor_iptu)}</div></div> : null}
                {imovel.area_total ? <div className="rounded-card border border-line bg-card p-3"><div className="text-[11px] text-ink-3">Área total</div><div className="font-semibold tabular-nums">{imovel.area_total} m²</div></div> : null}
              </div>
            )}
          </div>

          {/* card lateral: preço + CTA */}
          <aside className="self-start lg:sticky lg:top-6">
            <div className="rounded-card border border-line bg-card p-6">
              {imovel.valor_venda ? (
                <><div className="text-[12px] text-ink-3">Valor de venda</div>
                <div className="mb-3 text-[26px] font-bold tracking-[-0.02em] tabular-nums">{brl(imovel.valor_venda)}</div></>
              ) : null}
              {imovel.valor_locacao ? (
                <><div className="text-[12px] text-ink-3">Locação</div>
                <div className="mb-3 text-[20px] font-bold tracking-[-0.02em] tabular-nums">{brl(imovel.valor_locacao)}<span className="text-[13px] font-medium text-ink-2">/mês</span></div></>
              ) : null}
              {!imovel.valor_venda && !imovel.valor_locacao && <div className="mb-3 text-[15px] font-semibold">Sob consulta</div>}

              {zap ? (
                <a href={`https://wa.me/55${zap}?text=${msg}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-ink py-3 font-semibold text-white transition-colors hover:bg-ink/90">
                  <MessageCircle size={18} strokeWidth={1.7} /> Falar no WhatsApp
                </a>
              ) : (
                <div className="text-center text-[13px] text-ink-2">Entre em contato com a {empresa?.nome ?? 'imobiliária'}.</div>
              )}
              {imovel.codigo && <div className="mt-3 text-center font-mono text-[11px] text-ink-3">Cód. {imovel.codigo}</div>}
            </div>
          </aside>
        </div>
      </div>

      <footer className="pb-8 text-center text-[12px] text-ink-3">
        {empresa?.nome} · powered by Nexus
      </footer>
    </main>
  )
}
