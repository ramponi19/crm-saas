'use client'


import { useState, useEffect } from 'react'
import { useOrigem } from '@/lib/navegador'
import { Card, Button, notify } from '@/components/ui'
import { UtensilsCrossed, Copy, ExternalLink, Download } from 'lucide-react'

/** Cardápio digital (Food): URL pública + QR pra imprimir na mesa. QR gerado no cliente. */
export function CardapioCard({ slug }: { slug: string | null }) {
  const base = useOrigem()
  const [qr, setQr] = useState('')

  const url = slug && base ? `${base.replace(/\/$/, '')}/menu/${slug}` : ''

  useEffect(() => {
    if (!url) return
    let ativo = true
    import('qrcode').then((QR) => QR.toDataURL(url, { width: 320, margin: 2 }))
      .then((d) => { if (ativo) setQr(d) })
      .catch(() => {/* sem QR, link ainda funciona */})
    return () => { ativo = false }
  }, [url])

  function baixar() {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr; a.download = `cardapio-${slug}.png`; a.click()
  }

  return (
    <Card title={<span className="flex items-center gap-2"><UtensilsCrossed size={16} strokeWidth={1.7} className="text-accent" />Cardápio digital</span>}>
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Compartilhe o link ou imprima o QR na mesa. O cliente monta o pedido e envia pelo WhatsApp.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-raised px-3 py-2">
        <code className="num min-w-0 flex-1 truncate text-[12.5px] text-ink">{url || 'Empresa sem slug'}</code>
        <Button variant="outline" size="sm" icon={<Copy size={14} strokeWidth={1.7} />} onClick={() => { navigator.clipboard?.writeText(url); notify.ok('Link copiado') }} disabled={!url}>Copiar</Button>
        {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-[12.5px] text-ink-2 hover:text-ink"><ExternalLink size={14} strokeWidth={1.7} />Abrir</a>}
      </div>

      {qr && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR do cardápio" className="h-44 w-44 rounded-card border border-line" />
          <Button variant="outline" size="sm" icon={<Download size={14} strokeWidth={1.7} />} onClick={baixar}>Baixar QR (PNG)</Button>
        </div>
      )}
    </Card>
  )
}
