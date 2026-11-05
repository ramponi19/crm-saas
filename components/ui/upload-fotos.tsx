'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { notify } from './toast'

const MAX_MB = 8
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export interface UploadFotosProps {
  label?: string
  /** URLs já enviadas. */
  value: string[]
  onChange: (urls: string[]) => void
  /** Pasta raiz no bucket — sempre o id da empresa (a policy exige). */
  empresaId: number
  /** 1 = foto única (troca ao enviar outra). */
  max?: number
  ajuda?: string
  disabled?: boolean
}

/**
 * Upload de fotos para o bucket `produtos`, com prévia e remoção.
 *
 * O caminho começa com o id da empresa porque a policy do Storage exige isso —
 * é o que impede uma loja de escrever na pasta da outra.
 */
export function UploadFotos({
  label = 'Fotos', value, onChange, empresaId, max = 6, ajuda, disabled,
}: UploadFotosProps) {
  const supabase = createClient()
  const input = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(0)

  const unica = max === 1
  const cheio = value.length >= max

  async function enviar(files: FileList | null) {
    if (!files?.length) return
    // Foto única: o arquivo novo substitui o anterior.
    const espaco = unica ? 1 : max - value.length
    const lista = Array.from(files).slice(0, Math.max(0, espaco))
    if (!lista.length) { notify.warn(`Máximo de ${max} foto${max === 1 ? '' : 's'}`); return }

    const novas: string[] = []
    for (const file of lista) {
      if (!TIPOS.includes(file.type)) { notify.warn(`${file.name}: formato não aceito`, 'Use JPG, PNG ou WEBP'); continue }
      if (file.size > MAX_MB * 1024 * 1024) { notify.warn(`${file.name} passa de ${MAX_MB} MB`); continue }

      setEnviando((n) => n + 1)
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const caminho = `${empresaId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('produtos')
        .upload(caminho, file, { cacheControl: '31536000', upsert: false, contentType: file.type })
      setEnviando((n) => n - 1)
      if (error) { notify.bad(`Falha ao enviar ${file.name}`, error.message); continue }
      novas.push(supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl)
    }
    if (novas.length) onChange(unica ? novas.slice(0, 1) : [...value, ...novas])
  }

  return (
    <div>
      <label className="mb-1 block text-[12.5px] font-medium text-ink-2">{label}</label>

      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <div key={url} className="group relative h-20 w-20 overflow-hidden rounded-control border border-line bg-raised">
            {/* <img> puro: a URL é do Storage e não passa pelo otimizador. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            {!disabled && (
              <button type="button" aria-label="Remover foto"
                onClick={() => onChange(value.filter((u) => u !== url))}
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-ink/70 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <X size={12} strokeWidth={2.4} />
              </button>
            )}
          </div>
        ))}

        {!disabled && (!cheio || unica) && (
          <button type="button" onClick={() => input.current?.click()} disabled={enviando > 0}
            className={cn('grid h-20 w-20 place-items-center rounded-control border border-dashed border-line text-ink-3 transition-colors',
              'hover:border-accent hover:text-accent disabled:opacity-60')}>
            {enviando > 0
              ? <Loader2 size={18} strokeWidth={1.9} className="animate-spin" />
              : <ImagePlus size={18} strokeWidth={1.8} />}
          </button>
        )}
      </div>

      <input ref={input} type="file" accept={TIPOS.join(',')} multiple={!unica} className="hidden"
        onChange={(e) => { enviar(e.target.files); e.target.value = '' }} />

      <p className="mt-1 text-[11px] text-ink-3">
        {ajuda ?? (unica
          ? `Uma foto do modelo. JPG, PNG ou WEBP até ${MAX_MB} MB.`
          : `Até ${max} fotos. JPG, PNG ou WEBP até ${MAX_MB} MB cada.`)}
      </p>
    </div>
  )
}
