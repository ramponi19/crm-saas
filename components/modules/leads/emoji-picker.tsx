'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Smile } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GRUPOS_EMOJI } from '@/lib/emojis'

/**
 * Seletor de emoji do chat.
 *
 * Emoji sempre funcionou no envio e no recebimento — é texto Unicode, e
 * WhatsApp, Instagram e Messenger trafegam UTF-8. O que faltava era um jeito de
 * PÔR o emoji sem depender do Win+. do Windows, que ninguém no balcão conhece.
 *
 * 821 emojis, sem biblioteca: são só os caracteres (~3 KB), e quem desenha é a
 * fonte do sistema. Biblioteca de emoji passa de 1 MB porque traz as figuras.
 */

/** Ícone de cada aba — o nome escrito não cabia em 300px com 10 categorias. */
const ICONE: Record<string, string> = {
  Recentes: '🕐', Rostos: '😀', Pessoas: '🖐️', Natureza: '🐻', Comida: '🍔',
  Lugares: '✈️', Atividades: '⚽', Objetos: '💡', 'Símbolos': '🔣', Bandeiras: '🏳️',
}

const RECENTES_CHAVE = 'nexus:emojis-recentes'
const MAX_RECENTES = 24

function lerRecentes(): string[] {
  try {
    const cru = localStorage.getItem(RECENTES_CHAVE)
    return cru ? (JSON.parse(cru) as string[]).slice(0, MAX_RECENTES) : []
  } catch { return [] }
}

export function EmojiPicker({ onEscolher, disabled }: { onEscolher: (emoji: string) => void; disabled?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [aba, setAba] = useState(0)
  const [recentes, setRecentes] = useState<string[]>([])
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => { if (aberto) setRecentes(lerRecentes()) }, [aberto])

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

  /** Usados recentemente primeiro: no balcão são sempre os mesmos cinco. */
  const abas = useMemo(
    () => (recentes.length ? [{ nome: 'Recentes', emojis: recentes }, ...GRUPOS_EMOJI] : GRUPOS_EMOJI),
    [recentes],
  )
  const atual = abas[Math.min(aba, abas.length - 1)]

  function escolher(e: string) {
    onEscolher(e)
    try {
      const novos = [e, ...lerRecentes().filter((x) => x !== e)].slice(0, MAX_RECENTES)
      localStorage.setItem(RECENTES_CHAVE, JSON.stringify(novos))
      setRecentes(novos)
    } catch { /* sem localStorage o seletor continua funcionando, só sem histórico */ }
  }

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
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[300px] rounded-card border border-line bg-card shadow-[0_16px_40px_-16px_rgba(21,24,28,0.28)]">
          {/* Abas por ÍCONE, não por nome escrito. Com os nomes, dez categorias
              não cabiam nos 300px e as últimas — Objetos, Símbolos, Bandeiras —
              ficavam fora do alcance do mouse, porque a faixa rola sem barra e
              sem seta. Ícone cabe, e é o que todo seletor de emoji usa.
              O nome continua no `title`, para quem passar o mouse. */}
          <div className="flex items-center justify-between gap-0.5 border-b border-line-soft px-1.5 py-1">
            {abas.map((g, i) => (
              <button
                key={g.nome}
                type="button"
                title={g.nome}
                aria-label={g.nome}
                onClick={() => setAba(i)}
                className={cn(
                  'grid h-7 w-7 flex-1 place-items-center rounded-control text-[15px] leading-none transition-colors',
                  i === Math.min(aba, abas.length - 1) ? 'bg-ink/[0.08]' : 'opacity-45 hover:opacity-100',
                )}
              >
                {ICONE[g.nome] ?? '•'}
              </button>
            ))}
          </div>

          <div className="max-h-[220px] overflow-y-auto p-2 scrollbar-thin">
            <div className="grid grid-cols-8 gap-0.5">
              {atual.emojis.map((e, i) => (
                <button
                  key={`${e}-${i}`}
                  type="button"
                  // Não fecha ao escolher: quem manda 🎉 costuma mandar 🔥 junto.
                  onClick={() => escolher(e)}
                  className="grid h-8 w-8 place-items-center rounded-control text-[19px] leading-none transition-colors hover:bg-ink/[0.06]"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
