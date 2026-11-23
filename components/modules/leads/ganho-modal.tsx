'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal, Button, Input, Select } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { useFuso } from '@/components/fuso-provider'
import { diaNoFuso } from '@/lib/datas'
import { CONDICOES, DATA_MINIMA, validarVendaGanho, type CampoVenda, type CondicaoVenda } from '@/lib/venda-ganho'
import { cn } from '@/lib/utils'

/** O que o modal devolve — vai no corpo de /api/leads/mover como `venda`. */
export interface VendaDoModal {
  data: string
  categoria_id: number | null
  condicao: CondicaoVenda
  valor: string
}

interface Props {
  leadNome: string
  /** Valor estimado do negócio, para já vir preenchido. */
  valorInicial?: number | null
  /** Dia de criação do negócio (YYYY-MM-DD), para a mesma regra do servidor; sem ele a tela não confere. */
  criadoEm?: string | null
  /** Texto do botão (padrão "Marcar como venda"). */
  confirmar?: string
  /** Como a empresa chama o item usado (vocabulário; padrão "Usado"). */
  rotuloUsado?: string
  loading?: boolean
  /** Erro que o SERVIDOR devolveu (422 GANHO_DADOS), mostrado no campo. */
  erroServidor?: { campo?: string; erro: string } | null
  onConfirm: (venda: VendaDoModal) => void
  onCancel: () => void
}

/** Lista curta: até este tanto de categorias vira botão; mais que isso, lista suspensa. */
const MAX_BOTOES = 8

/**
 * VENDA FECHADA (23/11/2026, Entrega A do pós-venda). Rápido de preencher no balcão: quatro
 * campos — data (hoje por padrão), categoria, novo/usado, valor (teclado numérico no
 * celular). As mesmas regras da rota (lib/venda-ganho.ts); o servidor confere de novo.
 */
export function GanhoModal({ leadNome, valorInicial, criadoEm, confirmar = 'Marcar como venda', rotuloUsado, loading, erroServidor, onConfirm, onCancel }: Props) {
  const { empresa } = useEmpresa()
  const fuso = useFuso()
  const hoje = useMemo(() => diaNoFuso(new Date(), fuso), [fuso])
  const [data, setData] = useState(hoje)
  const [categoria, setCategoria] = useState<number | null>(null)
  const [condicao, setCondicao] = useState<CondicaoVenda | null>(null)
  const [valor, setValor] = useState(valorInicial && valorInicial > 0 ? String(valorInicial).replace('.', ',') : '')
  const [categorias, setCategorias] = useState<{ id: number; nome: string }[] | null>(null)
  const [tentou, setTentou] = useState(false)

  useEffect(() => {
    if (!empresa?.id) return
    let vivo = true
    createClient().from('estoque_categorias').select('id, nome')
      .eq('empresa_id', empresa.id).eq('ativo', true).order('ordem').order('nome')
      .then(({ data: cats }) => { if (vivo) setCategorias(((cats ?? []) as { id: number; nome: string }[])) })
    return () => { vivo = false }
  }, [empresa?.id])

  const checagem = validarVendaGanho(
    { data, categoria_id: categoria, condicao: condicao ?? undefined, valor },
    { hoje, criadoEm: criadoEm ?? DATA_MINIMA, categorias: (categorias ?? []).map((c) => c.id) },
  )
  const erroDe = (campo: CampoVenda): string | undefined => {
    if (erroServidor?.campo === campo) return erroServidor.erro
    return tentou && !checagem.ok && checagem.campo === campo ? checagem.erro : undefined
  }

  function enviar() {
    setTentou(true)
    if (!checagem.ok || categorias == null || condicao == null) return
    onConfirm({ data, categoria_id: categoria, condicao, valor })
  }

  const botao = 'min-h-[40px] rounded-lg border px-3 text-[13px] font-medium transition-colors'
  const ativo = 'border-accent bg-accent/10 text-ink'
  const inativo = 'border-line bg-card text-ink-2 hover:border-ink-3'

  return (
    <Modal
      open
      onClose={() => !loading && onCancel()}
      size="sm"
      disableOverlayClose={loading}
      title="Venda fechada"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancelar</Button>
          <Button onClick={enviar} loading={loading} disabled={categorias == null}>{confirmar}</Button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-ink-2">
        Venda de <strong className="text-ink">{leadNome || 'lead'}</strong>. Esses dados contam a régua de pós-venda.
      </p>

      <div className="space-y-4">
        <Input label="Data da venda" type="date" value={data} max={hoje} min={DATA_MINIMA}
          onChange={(e) => setData(e.target.value)} error={erroDe('data')} required />

        {categorias == null ? (
          <p className="text-[13px] text-ink-3">Carregando categorias…</p>
        ) : categorias.length === 0 ? null : categorias.length <= MAX_BOTOES ? (
          <fieldset>
            <legend className="mb-1.5 text-[12.5px] font-medium text-ink-2">Categoria <span className="text-bad">*</span></legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Categoria">
              {categorias.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={categoria === c.id}
                  className={cn(botao, categoria === c.id ? ativo : inativo)} onClick={() => setCategoria(c.id)}>
                  {c.nome}
                </button>
              ))}
            </div>
            {erroDe('categoria_id') && <p className="mt-1 text-[12px] text-bad">{erroDe('categoria_id')}</p>}
          </fieldset>
        ) : (
          <Select label="Categoria" value={categoria == null ? '' : String(categoria)} required
            onChange={(e) => setCategoria(e.target.value ? Number(e.target.value) : null)} error={erroDe('categoria_id')}>
            <option value="">Selecione…</option>
            {categorias.map((c) => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
          </Select>
        )}

        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-medium text-ink-2">Condição <span className="text-bad">*</span></legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Condição">
            {CONDICOES.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={condicao === c.id}
                className={cn(botao, condicao === c.id ? ativo : inativo)} onClick={() => setCondicao(c.id)}>
                {c.id === 'seminovo' && rotuloUsado ? rotuloUsado : c.rotulo}
              </button>
            ))}
          </div>
          {erroDe('condicao') && <p className="mt-1 text-[12px] text-bad">{erroDe('condicao')}</p>}
        </fieldset>

        <Input label="Valor da venda (R$)" inputMode="decimal" autoComplete="off" placeholder="0,00"
          value={valor} onChange={(e) => setValor(e.target.value)} error={erroDe('valor')} required />
      </div>
    </Modal>
  )
}
