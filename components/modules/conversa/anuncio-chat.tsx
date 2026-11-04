'use client'

import { Megaphone } from 'lucide-react'

/**
 * Card do anúncio que trouxe o cliente.
 *
 * É o mesmo bloco que ele vê no aparelho antes de escrever — e sem ele o
 * vendedor lê "Quero saber quais iPhones novos lacrados tem disponível" sem
 * saber de qual campanha veio nem o que a pessoa acabou de ler.
 */
export function AnuncioChat({ conteudo, midiaUrl }: { conteudo: string; midiaUrl?: string | null }) {
  let a: { titulo?: string | null; corpo?: string | null; url?: string | null; plataforma?: string | null; anuncio_id?: string | null }
  try { a = JSON.parse(conteudo) } catch { return <span className="text-[13px] italic text-[#667781]">Veio de um anúncio</span> }

  return (
    <div className="mb-1 overflow-hidden rounded-[8px] border border-[#25d366]/30 bg-[#f7fdf9]">
      {midiaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={midiaUrl} alt="Imagem do anúncio" className="max-h-[150px] w-full object-cover" />
      )}
      <div className="px-2.5 py-2">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#128c7e]">
          <Megaphone size={11} strokeWidth={2} />
          Veio de anúncio{a.plataforma ? ` · ${a.plataforma}` : ''}
        </div>
        {a.titulo && <div className="text-[12.5px] font-semibold leading-tight text-[#111b21]">{a.titulo}</div>}
        {a.corpo && <div className="mt-0.5 line-clamp-3 text-[11.5px] leading-snug text-[#667781]">{a.corpo}</div>}
        {a.url && (
          <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] font-medium text-[#128c7e] underline">
            {a.url}
          </a>
        )}
        {a.anuncio_id && <div className="mt-1 text-[10px] text-ink-3">ID da campanha: {a.anuncio_id}</div>}
      </div>
    </div>
  )
}
