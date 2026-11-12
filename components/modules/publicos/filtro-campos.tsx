'use client'

/**
 * OS CAMPOS DO FILTRO DE UMA LISTA (12/11/2026): os mesmos na Transmissão ("Quem recebe") e no
 * módulo Públicos. Saíram da tela da Transmissão sem mudar nada do que aparece (os data-* ficam,
 * os e2e procuram por eles). A regra é do banco (publicos_resolver); o formato e a descrição, de
 * lib/transmissao/filtro.ts.
 */
import { useMemo } from 'react'
import { Input, Select } from '@/components/ui'
import { SITUACOES, type FiltroPublico, type NomesDoFiltro, type Situacao } from '@/lib/transmissao/filtro'
import { FiltroEtiquetasLinha, useEtiquetas } from '@/components/modules/etiquetas/etiquetas'

export interface FunilOpcao { id: number; nome: string }
export interface EtapaOpcao { id: number; funil_id: number; label: string }

export const chip = (ativo: boolean) =>
  `rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${ativo ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2 hover:text-ink'}`

/** Os nomes que a descrição do filtro usa (funis, etapas, etiquetas). */
export function useNomesDoFiltro(funis: FunilOpcao[], etapas: EtapaOpcao[]): NomesDoFiltro {
  const etiquetas = useEtiquetas()
  return useMemo(() => ({
    funis: new Map(funis.map((f) => [f.id, f.nome])),
    etapas: new Map(etapas.map((e) => [e.id, e.label])),
    etiquetas: new Map(etiquetas.map((e) => [e.id, e.nome])),
  }), [funis, etapas, etiquetas])
}

export function FiltroCampos({ filtro, onChange, funis, etapas, origens, etiquetasAttr = 'data-filtro-etiquetas-transmissao' }: {
  filtro: FiltroPublico
  onChange: (f: (atual: FiltroPublico) => FiltroPublico) => void
  funis: FunilOpcao[]
  etapas: EtapaOpcao[]
  origens: string[]
  /** O data-* do bloco de etiquetas (a Transmissão tem o dela, que o e2e das etiquetas procura). */
  etiquetasAttr?: string
}) {
  const todasEtiquetas = useEtiquetas()
  const etapasDoFunil = etapas.filter((e) => !filtro.funil_id || e.funil_id === filtro.funil_id)
  const alterna = <K extends 'etapa_ids' | 'situacoes' | 'origens'>(chave: K, v: NonNullable<FiltroPublico[K]>[number]) =>
    onChange((f) => {
      const atual = (f[chave] ?? []) as (typeof v)[]
      const nova = atual.includes(v) ? atual.filter((x) => x !== v) : [...atual, v]
      return { ...f, [chave]: nova.length ? nova : undefined }
    })
  const dias = (chave: 'sem_mensagem_ha_dias' | 'com_mensagem_nos_dias', v: string) =>
    onChange((f) => ({ ...f, [chave]: Number(v) > 0 ? Math.floor(Number(v)) : undefined }))

  return (
    <>
      <Select label="Funil" value={filtro.funil_id ?? ''} onChange={(e) => onChange((f) => ({ ...f, funil_id: Number(e.target.value) || undefined, etapa_ids: undefined }))}>
        <option value="">Qualquer funil</option>
        {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
      </Select>
      <div>
        <div className="mb-1.5 text-[12px] font-medium text-ink-2">Etapa</div>
        <div className="flex flex-wrap gap-1.5">
          {etapasDoFunil.map((e) => (
            <button key={e.id} type="button" data-filtro-etapa={e.id} className={chip(!!filtro.etapa_ids?.includes(e.id))} onClick={() => alterna('etapa_ids', e.id)}>{e.label}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[12px] font-medium text-ink-2">Situação do negócio</div>
        <div className="flex flex-wrap gap-1.5">
          {SITUACOES.map((s) => (
            <button key={s.id} type="button" data-filtro-situacao={s.id} className={chip(!!filtro.situacoes?.includes(s.id))} onClick={() => alterna('situacoes', s.id as Situacao)}>{s.rotulo}</button>
          ))}
        </div>
      </div>
      {origens.length > 0 && (
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-ink-2">Origem do contato</div>
          <div className="flex flex-wrap gap-1.5">
            {origens.map((o) => (
              <button key={o} type="button" data-filtro-origem={o} className={chip(!!filtro.origens?.includes(o))} onClick={() => alterna('origens', o)}>{o}</button>
            ))}
          </div>
        </div>
      )}
      {todasEtiquetas.length > 0 && (
        <div {...{ [etiquetasAttr]: '' }}>
          <div className="mb-1.5 text-[12px] font-medium text-ink-2">Etiqueta <span className="font-normal text-ink-3">(clique: contém; de novo: não contém)</span></div>
          <FiltroEtiquetasLinha className="flex-wrap"
            valor={{ com: filtro.etiquetas_com ?? [], sem: filtro.etiquetas_sem ?? [] }}
            onChange={(e) => onChange((f) => ({ ...f, etiquetas_com: e.com.length ? e.com : undefined, etiquetas_sem: e.sem.length ? e.sem : undefined }))} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Sem mensagem há mais de (dias)" type="number" min={1} value={filtro.sem_mensagem_ha_dias ?? ''} onChange={(e) => dias('sem_mensagem_ha_dias', e.target.value)} data-filtro-sem />
        <Input label="Com mensagem nos últimos (dias)" type="number" min={1} value={filtro.com_mensagem_nos_dias ?? ''} onChange={(e) => dias('com_mensagem_nos_dias', e.target.value)} data-filtro-com />
      </div>
    </>
  )
}
