'use client'

import { useState, useEffect } from 'react'
import { Card, Button, Badge, notify } from '@/components/ui'
import { Copy, ExternalLink, Rss } from 'lucide-react'

/**
 * Portais imobiliários — mostra a URL do feed XML (padrão ZAP/VivaReal/Canal Pro)
 * que o tenant cadastra no portal. O feed já é servido por /api/portais/[slug].
 */
export function PortaisCard({ slug }: { slug: string | null }) {
  const [base, setBase] = useState(process.env.NEXT_PUBLIC_APP_URL || '')
  useEffect(() => { if (!base && typeof window !== 'undefined') setBase(window.location.origin) }, [base])

  const url = slug ? `${base.replace(/\/$/, '')}/api/portais/${slug}` : ''

  function copiar() {
    if (!url) return
    navigator.clipboard?.writeText(url)
    notify.ok('Link copiado')
  }

  return (
    <Card title={<span className="flex items-center gap-2"><Rss size={16} strokeWidth={1.7} className="text-accent" />Portais imobiliários</span>}>
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Cadastre a URL abaixo no seu portal (ZAP, VivaReal, Imovelweb / Canal Pro). O feed é atualizado sozinho e
        publica só os imóveis marcados como <strong className="text-ink">“Publicar em portais”</strong> e com status
        <strong className="text-ink"> disponível</strong>.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-raised px-3 py-2">
        <code className="num min-w-0 flex-1 truncate text-[12.5px] text-ink">{url || 'Empresa sem slug'}</code>
        <Button variant="outline" size="sm" icon={<Copy size={14} strokeWidth={1.7} />} onClick={copiar} disabled={!url}>Copiar</Button>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-[12.5px] text-ink-2 hover:text-ink">
            <ExternalLink size={14} strokeWidth={1.7} /> Abrir
          </a>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 text-[12px] text-ink-3">
        <Badge tone="neutro">Dica</Badge>
        <span>O portal reconsulta essa URL periodicamente. Ao publicar/despublicar um imóvel, a mudança aparece no próximo ciclo do portal (normalmente algumas horas).</span>
      </div>
    </Card>
  )
}
