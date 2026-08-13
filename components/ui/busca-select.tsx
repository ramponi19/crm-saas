'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OpcaoBusca {
  id: string | number
  /** O que aparece na linha e no campo depois de escolher. */
  nome: string
  /** Segunda linha: telefone, CPF, cidade — o que ajuda a distinguir homônimos. */
  detalhe?: string | null
  /** Texto extra que a busca considera mas não mostra (CPF sem máscara, apelido). */
  busca?: string | null
}

/**
 * Seleção com busca, para listas em que rolar não é opção.
 *
 * Um `<select>` comum obriga a percorrer a lista inteira: com 40 clientes já é
 * ruim, com 400 é inviável — e o operador acaba cadastrando de novo em vez de
 * procurar, que é como nasce cliente duplicado.
 *
 * A busca compara IGNORANDO acento e pontuação, e casa QUALQUER PALAVRA: "silva
 * ana" acha "Ana Paula da Silva", e "12345678900" acha quem está cadastrado como
 * "123.456.789-00". No balcão ninguém digita do jeito que está no cadastro.
 */
export function BuscaSelect({
  label, valor, opcoes, onChange, placeholder = 'Buscar…', vazio = '— Nenhum —', disabled,
}: {
  label: string
  valor: string
  opcoes: OpcaoBusca[]
  onChange: (id: string) => void
  placeholder?: string
  vazio?: string
  disabled?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const caixa = useRef<HTMLDivElement>(null)
  const campoBusca = useRef<HTMLInputElement>(null)

  const escolhido = opcoes.find((o) => String(o.id) === String(valor))

  // Fecha ao clicar fora: sem isto a lista fica presa sobre a tela e tapa o
  // formulário, e o jeito de sair vira recarregar a página.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    setTimeout(() => campoBusca.current?.focus(), 30)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  const normalizar = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

  const filtradas = useMemo(() => {
    const q = termo.trim()
    if (!q) return opcoes.slice(0, 50)
    const partes = q.split(/\s+/).map(normalizar).filter(Boolean)
    return opcoes
      .filter((o) => {
        const alvo = normalizar(`${o.nome} ${o.detalhe ?? ''} ${o.busca ?? ''}`)
        return partes.every((p) => alvo.includes(p))
      })
      .slice(0, 50)
  }, [opcoes, termo])

  return (
    <div className="flex flex-col gap-1.5" ref={caixa}>
      <label className="text-[12px] font-medium text-ink-2">{label}</label>

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setAberto((a) => !a)}
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-control border border-line bg-card px-3 text-left text-[13px] transition-colors',
            'hover:border-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60',
          )}
        >
          <Search size={14} strokeWidth={1.8} className="shrink-0 text-ink-3" />
          <span className={cn('flex-1 truncate', escolhido ? 'text-ink' : 'text-ink-3')}>
            {escolhido ? escolhido.nome : vazio}
          </span>
          {escolhido && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpar"
              onClick={(e) => { e.stopPropagation(); onChange('') }}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-line-soft hover:text-ink"
            >
              <X size={13} strokeWidth={2} />
            </span>
          )}
        </button>

        {aberto && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-control border border-line bg-card shadow-lg">
            <div className="border-b border-line-soft p-2">
              <input
                ref={campoBusca}
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder={placeholder}
                className="h-9 w-full rounded-control border border-line bg-raised px-2.5 text-[13px] text-ink outline-none focus:border-accent"
              />
            </div>

            <div className="max-h-[240px] overflow-y-auto scrollbar-thin">
              {filtradas.length === 0 && (
                <p className="px-3 py-4 text-center text-[12.5px] text-ink-3">Nada encontrado para “{termo}”.</p>
              )}
              {filtradas.map((o) => {
                const ativo = String(o.id) === String(valor)
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => { onChange(String(o.id)); setAberto(false); setTermo('') }}
                    className={cn(
                      'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-line-soft',
                      ativo && 'bg-accent-soft',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">{o.nome}</div>
                      {o.detalhe && <div className="truncate text-[11.5px] text-ink-3">{o.detalhe}</div>}
                    </div>
                    {ativo && <Check size={14} strokeWidth={2.2} className="mt-0.5 shrink-0 text-accent" />}
                  </button>
                )
              })}
              {opcoes.length > 50 && !termo && (
                <p className="border-t border-line-soft px-3 py-2 text-[11px] text-ink-3">
                  Mostrando 50 de {opcoes.length} — digite para procurar.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
