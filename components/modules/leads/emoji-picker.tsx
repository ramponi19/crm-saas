'use client'

import { useEffect, useRef, useState } from 'react'
import { Smile } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Seletor de emoji do chat.
 *
 * Emoji sempre funcionou no envio e no recebimento — é texto Unicode comum, e
 * WhatsApp, Instagram e Messenger trafegam UTF-8. O que faltava era um jeito de
 * PÔR o emoji sem sair do teclado do computador (no Windows é Win+. , que quase
 * ninguém no balcão conhece).
 *
 * Lista curada em vez de biblioteca: um pacote de emoji completo passa de 1 MB
 * e traz busca, categorias e sprites que ninguém vai usar para mandar 👍 ao
 * cliente. Estes são os que aparecem em conversa de loja.
 */
const GRUPOS: { nome: string; emojis: string[] }[] = [
  {
    nome: 'Frequentes',
    emojis: ['😀', '😁', '😂', '🤣', '😊', '😉', '😍', '😘', '🥰', '😎', '🤩', '🥳', '😅', '🙃', '😇', '🤗'],
  },
  {
    nome: 'Gestos',
    emojis: ['👍', '👎', '👌', '🙏', '👏', '🤝', '✌️', '🤙', '💪', '🫰', '👋', '🤞'],
  },
  {
    nome: 'Loja',
    emojis: ['📱', '💻', '⌚', '🎧', '🔋', '📦', '🛒', '💰', '💳', '🧾', '🚚', '🏪', '🔧', '✅', '❌', '⚠️'],
  },
  {
    nome: 'Sentimentos',
    emojis: ['❤️', '🧡', '💚', '💙', '💜', '🔥', '⭐', '✨', '🎉', '🎁', '😢', '😭', '😡', '🤔', '😴', '🙈'],
  },
]

export function EmojiPicker({ onEscolher, disabled }: { onEscolher: (emoji: string) => void; disabled?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  return (
    <div className="relative shrink-0" ref={caixa}>
      <button
        type="button"
        aria-label="Inserir emoji"
        disabled={disabled}
        onClick={() => setAberto((a) => !a)}
        className={cn(
          'grid h-10 w-10 place-items-center rounded-control text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-ink disabled:opacity-60 sm:h-9 sm:w-9',
          aberto && 'bg-ink/[0.06] text-ink',
        )}
      >
        <Smile size={17} strokeWidth={1.7} />
      </button>

      {aberto && (
        <div className="absolute bottom-full left-0 z-50 mb-2 max-h-[260px] w-[268px] overflow-y-auto rounded-card border border-line bg-card p-2.5 shadow-[0_16px_40px_-16px_rgba(21,24,28,0.28)] scrollbar-thin">
          {GRUPOS.map((g) => (
            <div key={g.nome} className="mb-2 last:mb-0">
              <div className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">{g.nome}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {g.emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    // Não fecha ao escolher: quem manda 🎉 costuma mandar 🔥 junto.
                    onClick={() => onEscolher(e)}
                    className="grid h-8 w-8 place-items-center rounded-control text-[18px] leading-none transition-colors hover:bg-ink/[0.06]"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
