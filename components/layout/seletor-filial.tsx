'use client'

import { useEffect, useState } from 'react'
import { Store, Check, ChevronDown, Network } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { rotuloDaFilial, type Filial } from '@/lib/filiais'

/**
 * Seletor de loja no topo do CRM.
 *
 * NÃO APARECE COM UMA LOJA SÓ — que é o estado de quase toda empresa. Um seletor
 * com uma opção é ruído, e é o que faria esta mudança incomodar quem não pediu
 * filial nenhuma.
 *
 * Para o vendedor é um rótulo, não um controle: a loja dele vem do cadastro da
 * Equipe, e `filiais_visiveis()` no banco ignora qualquer seleção que ele tente
 * gravar. Mostrar mesmo assim importa — ele precisa saber de qual loja é o estoque
 * que está vendo.
 */

type Escolha = number | null

export function SeletorFilial() {
  const [filiais, setFiliais] = useState<Filial[]>([])
  const [oferecidas, setOferecidas] = useState<Filial[]>([])
  const [selecionada, setSelecionada] = useState<Escolha>(null)
  const [minhaLoja, setMinhaLoja] = useState<number | null>(null)
  const [podeTrocar, setPodeTrocar] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [trocando, setTrocando] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let vivo = true

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Etapa 1.1b: loja da pessoa, loja escolhida e permissão vêm do contexto da sessão (empresa ativa), não
      // de um vínculo qualquer; quem vê a rede é quem tem lojas.ver_rede (o mesmo que filiais_visiveis usa).
      const [{ data: lojas }, { data: ctx }, { data: atuacao }] = await Promise.all([
        // A RLS de `filiais` deixa qualquer membro LER a lista; só admin escreve.
        supabase.from('filiais').select('id, nome, cidade').eq('ativo', true).order('matriz', { ascending: false }).order('nome'),
        supabase.rpc('sessao_contexto' as never),
        // Correção de segurança de 26/11: o seletor só oferece loja em que a pessoa pode atuar (a mesma lista que o
        // banco confere ao gravar a loja do topo e os registros; migrações 20261126000900/0910).
        supabase.rpc('filiais_atuacao' as never),
      ])
      if (!vivo) return

      const c = ctx as { loja_da_pessoa: number | null; filial_atual: number | null; superadmin: boolean; permissoes: string[] } | null
      const podeAtuar = Array.isArray(atuacao) ? new Set((atuacao as unknown[]).map(Number)) : null
      const todas = (lojas ?? []) as unknown as Filial[]
      setFiliais(todas)
      setOferecidas(podeAtuar ? todas.filter((f) => podeAtuar.has(Number(f.id))) : [])
      setMinhaLoja(c?.loja_da_pessoa ?? null)
      setSelecionada(c?.filial_atual ?? null)
      setPodeTrocar(!!c && (c.superadmin || c.permissoes.includes('lojas.ver_rede')))
    })()

    return () => { vivo = false }
  }, [])

  // Uma loja (ou nenhuma): nada a escolher, e o banco também não separa nada.
  if (filiais.length < 2) return null

  const atual = filiais.find((f) => f.id === selecionada) ?? null

  if (!podeTrocar) {
    const minha = filiais.find((f) => f.id === minhaLoja)
    if (!minha) return null
    return (
      <span className="hidden items-center gap-1.5 rounded-control border border-line bg-card px-2.5 py-1.5 text-[12.5px] text-ink-2 sm:inline-flex">
        <Store size={14} strokeWidth={1.7} className="text-ink-3" />
        <span className="max-w-[160px] truncate">{rotuloDaFilial(minha)}</span>
      </span>
    )
  }

  async function escolher(id: Escolha) {
    setTrocando(true)
    const r = await fetch('/api/filial/selecionar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filialId: id }),
    })
    if (!r.ok) { setTrocando(false); return }
    /**
     * Recarrega a página inteira, e não `router.refresh()`.
     *
     * A loja selecionada é lida pela RLS, então TODO dado já buscado é da loja
     * anterior — inclusive o que componentes de tela buscaram por conta própria, que
     * um refresh de servidor não tocaria. Meia atualização deixaria número de uma
     * loja ao lado de número de outra, que é exatamente a confusão que separar as
     * lojas existe para evitar.
     */
    window.location.reload()
  }

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => setAberto((o) => !o)}
        disabled={trocando}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1.5 text-[12.5px] transition-colors',
          atual ? 'border-line bg-card text-ink' : 'border-accent/30 bg-accent-soft text-accent',
          trocando && 'opacity-60',
        )}
      >
        {atual
          ? <Store size={14} strokeWidth={1.7} className="text-ink-3" />
          : <Network size={14} strokeWidth={1.7} />}
        <span className="max-w-[160px] truncate font-medium">
          {atual ? rotuloDaFilial(atual) : 'Rede (todas)'}
        </span>
        <ChevronDown size={13} strokeWidth={2} className="text-ink-3" />
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-[38px] z-30 w-[240px] overflow-hidden rounded-card border border-line bg-card py-1 shadow-[0_24px_60px_-24px_rgba(21,24,28,0.35)]">
            <button
              onClick={() => escolher(null)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-bg"
            >
              <Network size={14} strokeWidth={1.7} className="text-accent" />
              <span className="flex-1">Rede (todas as lojas)</span>
              {selecionada === null && <Check size={14} strokeWidth={2} className="text-accent" />}
            </button>
            <div className="my-1 h-px bg-line-soft" />
            {oferecidas.map((f) => (
              <button
                key={f.id}
                onClick={() => escolher(f.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-bg"
              >
                <Store size={14} strokeWidth={1.7} className="text-ink-3" />
                <span className="flex-1 truncate">{rotuloDaFilial(f)}</span>
                {selecionada === f.id && <Check size={14} strokeWidth={2} className="text-accent" />}
              </button>
            ))}
            <div className="border-t border-line-soft px-3 py-2 text-[11px] leading-snug text-ink-3">
              Em <strong>Rede</strong> você vê o consolidado. Ao escolher uma loja, o CRM
              inteiro passa a mostrar só ela.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
