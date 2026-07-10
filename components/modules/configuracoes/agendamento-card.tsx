'use client'

import { useState, useEffect } from 'react'
import { Card, Button, notify } from '@/components/ui'
import { CalendarClock, Copy, ExternalLink, Download } from 'lucide-react'

/** Agendamento online 24h (Saúde): URL pública + QR. O paciente marca sozinho. */
export function AgendamentoCard({ slug }: { slug: string | null }) {
  const [base, setBase] = useState('')
  const [qr, setQr] = useState('')
  useEffect(() => { if (typeof window !== 'undefined') setBase(window.location.origin) }, [])

  const url = slug && base ? `${base.replace(/\/$/, '')}/agendar/${slug}` : ''

  useEffect(() => {
    if (!url) return
    let ativo = true
    import('qrcode').then((QR) => QR.toDataURL(url, { width: 320, margin: 2 }))
      .then((d) => { if (ativo) setQr(d) })
      .catch(() => {})
    return () => { ativo = false }
  }, [url])

  function baixar() {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr; a.download = `agendamento-${slug}.png`; a.click()
  }

  return (
    <Card title={<span className="flex items-center gap-2"><CalendarClock size={16} strokeWidth={1.7} className="text-accent" />Agendamento online 24h</span>}>
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Compartilhe o link ou imprima o QR. O paciente escolhe o horário livre e marca sozinho, a qualquer hora — o agendamento cai direto na sua Agenda.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-raised px-3 py-2">
        <code className="num min-w-0 flex-1 truncate text-[12.5px] text-ink">{url || 'Empresa sem slug'}</code>
        <Button variant="outline" size="sm" icon={<Copy size={14} strokeWidth={1.7} />} onClick={() => { navigator.clipboard?.writeText(url); notify.ok('Link copiado') }} disabled={!url}>Copiar</Button>
        {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-[12.5px] text-ink-2 hover:text-ink"><ExternalLink size={14} strokeWidth={1.7} />Abrir</a>}
      </div>

      {qr && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR do agendamento" className="h-44 w-44 rounded-card border border-line" />
          <Button variant="outline" size="sm" icon={<Download size={14} strokeWidth={1.7} />} onClick={baixar}>Baixar QR (PNG)</Button>
        </div>
      )}
    </Card>
  )
}
