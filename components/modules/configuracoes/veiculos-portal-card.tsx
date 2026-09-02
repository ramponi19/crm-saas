'use client'


import { useOrigem } from '@/lib/navegador'
import { Card, Button, Badge, notify } from '@/components/ui'
import { Copy, ExternalLink, Rss } from 'lucide-react'

/**
 * Portais de veículos — URL do feed XML do estoque (/api/veiculos/[slug]) que o
 * tenant cadastra no portal (Webmotors/OLX/iCarros etc.). Atualiza sozinho.
 */
export function VeiculosPortalCard({ slug }: { slug: string | null }) {
  const origem = useOrigem()
  const base = process.env.NEXT_PUBLIC_APP_URL || origem

  const url = slug ? `${base.replace(/\/$/, '')}/api/veiculos/${slug}` : ''

  return (
    <Card title={<span className="flex items-center gap-2"><Rss size={16} strokeWidth={1.7} className="text-accent" />Portais de veículos</span>}>
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Cadastre a URL abaixo no portal de veículos. O feed publica automaticamente as unidades do estoque com status
        <strong className="text-ink"> disponível</strong> — quando você vende ou adiciona um veículo, o anúncio some/aparece sozinho no próximo ciclo do portal.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-raised px-3 py-2">
        <code className="num min-w-0 flex-1 truncate text-[12.5px] text-ink">{url || 'Empresa sem slug'}</code>
        <Button variant="outline" size="sm" icon={<Copy size={14} strokeWidth={1.7} />} onClick={() => { navigator.clipboard?.writeText(url); notify.ok('Link copiado') }} disabled={!url}>Copiar</Button>
        {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-[12.5px] text-ink-2 hover:text-ink"><ExternalLink size={14} strokeWidth={1.7} />Abrir</a>}
      </div>

      <div className="mt-4 flex items-start gap-2 text-[12px] text-ink-3">
        <Badge tone="neutro">Formato</Badge>
        <span>XML genérico (Código, Modelo, Ano, Quilometragem, Cor, Condição, Preço, Fotos). Alguns portais pedem mapeamento — nos avise o portal-alvo para ajustarmos os campos.</span>
      </div>
    </Card>
  )
}
