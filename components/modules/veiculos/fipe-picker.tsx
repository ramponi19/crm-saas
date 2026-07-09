'use client'

import { useState, useCallback } from 'react'
import { Search, Loader2, Check } from 'lucide-react'
import { Select, Button, notify } from '@/components/ui'

interface Opcao { label: string; value: string }
export interface ResultadoFipe {
  valor: number | null
  valorTexto: string | null
  codigoFipe: string | null
  mesReferencia: string | null
  marca: string | null
  modelo: string | null
  anoLabel: string | null
}

const TIPOS = [{ v: '1', label: 'Carro' }, { v: '2', label: 'Moto' }, { v: '3', label: 'Caminhão' }]
const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

/**
 * Seletor FIPE reutilizável: tipo → marca → modelo → ano → valor.
 * Se `onUsar` for passado, mostra "Usar este valor" (para preencher um formulário).
 */
export function FipePicker({ onUsar }: { onUsar?: (r: ResultadoFipe) => void }) {
  const [tipo, setTipo] = useState('1')
  const [marcas, setMarcas] = useState<Opcao[]>([])
  const [modelos, setModelos] = useState<Opcao[]>([])
  const [anos, setAnos] = useState<Opcao[]>([])
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [ano, setAno] = useState('')
  const [carregando, setCarregando] = useState<null | 'marcas' | 'modelos' | 'anos' | 'valor'>(null)
  const [resultado, setResultado] = useState<ResultadoFipe | null>(null)

  const opcoes = useCallback(async (params: string) => {
    const res = await fetch(`/api/fipe/opcoes?${params}`)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error ?? 'Falha ao consultar FIPE')
    return (j.opcoes ?? []) as Opcao[]
  }, [])

  async function carregarMarcas(t: string) {
    setCarregando('marcas')
    setMarcas([]); setModelos([]); setAnos([]); setMarca(''); setModelo(''); setAno(''); setResultado(null)
    try { setMarcas(await opcoes(`tipo=${t}`)) }
    catch (e) { notify.bad('FIPE', e instanceof Error ? e.message : undefined) }
    finally { setCarregando(null) }
  }
  async function carregarModelos(m: string) {
    setMarca(m); setModelos([]); setAnos([]); setModelo(''); setAno(''); setResultado(null)
    if (!m) return
    setCarregando('modelos')
    try { setModelos(await opcoes(`tipo=${tipo}&marca=${m}`)) }
    catch (e) { notify.bad('FIPE', e instanceof Error ? e.message : undefined) }
    finally { setCarregando(null) }
  }
  async function carregarAnos(mod: string) {
    setModelo(mod); setAnos([]); setAno(''); setResultado(null)
    if (!mod) return
    setCarregando('anos')
    try { setAnos(await opcoes(`tipo=${tipo}&marca=${marca}&modelo=${mod}`)) }
    catch (e) { notify.bad('FIPE', e instanceof Error ? e.message : undefined) }
    finally { setCarregando(null) }
  }

  async function consultar() {
    if (!marca || !modelo || !ano) { notify.warn('Selecione marca, modelo e ano'); return }
    setCarregando('valor'); setResultado(null)
    try {
      const res = await fetch('/api/fipe/valor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: Number(tipo), marca: Number(marca), modelo: Number(modelo), ano,
          marcaNome: marcas.find(m => m.value === marca)?.label,
          modeloNome: modelos.find(m => m.value === modelo)?.label,
          anoLabel: anos.find(a => a.value === ano)?.label,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Falha ao consultar valor')
      setResultado({ ...j, anoLabel: anos.find(a => a.value === ano)?.label ?? null })
    } catch (e) { notify.bad('FIPE', e instanceof Error ? e.message : undefined) }
    finally { setCarregando(null) }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <Select label="Tipo" value={tipo} onChange={e => { setTipo(e.target.value); carregarMarcas(e.target.value) }}>
          {TIPOS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
        </Select>
        <Select label="Marca" value={marca} onChange={e => carregarModelos(e.target.value)} disabled={carregando === 'marcas' || marcas.length === 0}>
          <option value="">{carregando === 'marcas' ? 'Carregando…' : marcas.length ? 'Selecionar…' : 'Escolha o tipo'}</option>
          {marcas.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <Select wrapperClassName="col-span-2" label="Modelo" value={modelo} onChange={e => carregarAnos(e.target.value)} disabled={carregando === 'modelos' || modelos.length === 0}>
          <option value="">{carregando === 'modelos' ? 'Carregando…' : modelos.length ? 'Selecionar…' : 'Escolha a marca'}</option>
          {modelos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <Select label="Ano" value={ano} onChange={e => { setAno(e.target.value); setResultado(null) }} disabled={carregando === 'anos' || anos.length === 0}>
          <option value="">{carregando === 'anos' ? 'Carregando…' : anos.length ? 'Selecionar…' : 'Escolha o modelo'}</option>
          {anos.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </Select>
        <div className="flex items-end">
          <Button className="w-full" variant="outline" onClick={consultar} loading={carregando === 'valor'} icon={<Search size={15} strokeWidth={1.7} />} disabled={!ano}>
            Consultar FIPE
          </Button>
        </div>
      </div>

      {resultado && (
        <div className="rounded-control border border-line bg-raised p-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-bold text-ink num">{resultado.valorTexto ?? brl(resultado.valor)}</span>
            {resultado.mesReferencia && <span className="text-[11.5px] text-ink-3">ref. {resultado.mesReferencia}</span>}
          </div>
          <div className="mt-0.5 text-[12px] text-ink-2">
            {[resultado.marca, resultado.modelo].filter(Boolean).join(' ')} · {resultado.anoLabel}
            {resultado.codigoFipe && <span className="text-ink-3"> · FIPE {resultado.codigoFipe}</span>}
          </div>
          {onUsar && (
            <Button size="sm" className="mt-2.5" onClick={() => onUsar(resultado)} icon={<Check size={14} strokeWidth={1.7} />}>
              Usar este valor
            </Button>
          )}
        </div>
      )}
      {carregando === 'valor' && !resultado && (
        <div className="flex items-center gap-2 text-[12.5px] text-ink-3"><Loader2 size={14} className="animate-spin" strokeWidth={1.7} />Consultando a FIPE…</div>
      )}
    </div>
  )
}
