'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, Input, Select } from '@/components/ui'
import { FileSpreadsheet, Printer, SlidersHorizontal, RotateCcw } from 'lucide-react'

/**
 * Filtros e exportação do relatório imobiliário.
 *
 * O filtro vive na URL (`?de=&ate=&corretor=`), e não em estado de cliente, por dois
 * motivos: o relatório é calculado no SERVIDOR (a tela não tem os dados para filtrar
 * sozinha) e o recorte fica compartilhável — o dono manda "olha agosto do João" com
 * o link, que é como relatório circula numa imobiliária.
 *
 * A exportação usa o MESMO recorte. Exportar o mês inteiro depois de filtrar uma
 * semana é o erro clássico de tela de relatório: o número da planilha não bate com o
 * da tela e ninguém descobre por quê.
 */

const HOJE = () => new Date()
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Atalhos: o dono pensa em "este mês", não em duas datas. */
function atalhos() {
  const h = HOJE()
  const inicioMes = new Date(h.getFullYear(), h.getMonth(), 1)
  const inicioMesPassado = new Date(h.getFullYear(), h.getMonth() - 1, 1)
  const fimMesPassado = new Date(h.getFullYear(), h.getMonth(), 0)
  const noventa = new Date(h.getTime() - 89 * 86400000)
  const inicioAno = new Date(h.getFullYear(), 0, 1)
  return [
    { id: 'mes', label: 'Este mês', de: iso(inicioMes), ate: iso(h) },
    { id: 'passado', label: 'Mês passado', de: iso(inicioMesPassado), ate: iso(fimMesPassado) },
    { id: '90d', label: '90 dias', de: iso(noventa), ate: iso(h) },
    { id: 'ano', label: 'Este ano', de: iso(inicioAno), ate: iso(h) },
  ]
}

export const TIPOS_EXPORT = [
  { v: 'imob_geral', l: 'Relatório geral' },
  { v: 'imob_clientes', l: 'Clientes' },
  { v: 'imob_imoveis', l: 'Imóveis' },
  { v: 'imob_pipeline', l: 'Pipeline' },
  { v: 'imob_financeiro', l: 'Financeiro' },
  { v: 'imob_corretores', l: 'Corretores' },
]

export function RelatoriosFiltros({ equipe, de, ate, corretor }: {
  equipe: { id: string; nome: string }[]
  de: string
  ate: string
  corretor: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [abrir, setAbrir] = useState(!!(params.get('de') || params.get('corretor')))
  const [tipo, setTipo] = useState(TIPOS_EXPORT[0].v)

  function aplicar(novo: { de?: string; ate?: string; corretor?: string }) {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(novo)) {
      if (v) p.set(k, v); else p.delete(k)
    }
    router.push(`/relatorios?${p.toString()}`)
  }

  function limpar() {
    router.push('/relatorios')
  }

  const urlExport = () => {
    const p = new URLSearchParams({ tipo })
    if (de) p.set('de', de)
    if (ate) p.set('ate', ate)
    if (corretor) p.set('corretor', corretor)
    return `/api/exportar?${p.toString()}`
  }

  const nomeCorretor = equipe.find((u) => u.id === corretor)?.nome

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button
          variant="outline"
          icon={<SlidersHorizontal size={15} strokeWidth={1.7} />}
          onClick={() => setAbrir((v) => !v)}
        >
          Filtros
        </Button>

        {atalhos().map((a) => (
          <button
            key={a.id}
            onClick={() => aplicar({ de: a.de, ate: a.ate })}
            className={`rounded-control border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              de === a.de && ate === a.ate ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2 hover:bg-bg'
            }`}
          >
            {a.label}
          </button>
        ))}

        <span className="ml-auto flex items-center gap-2">
          <Select aria-label="O que exportar" value={tipo} onChange={(e) => setTipo(e.target.value)} className="min-w-[170px]">
            {TIPOS_EXPORT.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </Select>
          {/*
            Link direto, não fetch: o navegador baixa o arquivo com o nome que a rota
            manda. Com fetch seria preciso montar blob e revogar URL à mão, para o
            mesmo resultado.
          */}
          <a
            href={urlExport()}
            className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-[7px] text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            <FileSpreadsheet size={14} strokeWidth={1.8} />Excel
          </a>
          <Button variant="outline" icon={<Printer size={14} strokeWidth={1.8} />} onClick={() => window.print()}>
            PDF
          </Button>
        </span>
      </div>

      {abrir && (
        <div className="grid gap-3 rounded-card border border-line bg-card p-3 print:hidden sm:grid-cols-4">
          <Input label="Data início" type="date" value={de} onChange={(e) => aplicar({ de: e.target.value })} />
          <Input label="Data fim" type="date" value={ate} onChange={(e) => aplicar({ ate: e.target.value })} />
          <Select label="Corretor" value={corretor} onChange={(e) => aplicar({ corretor: e.target.value })}>
            <option value="">Todos</option>
            {equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </Select>
          <div className="flex items-end">
            <Button variant="ghost" icon={<RotateCcw size={14} strokeWidth={1.8} />} onClick={limpar}>
              Limpar
            </Button>
          </div>
        </div>
      )}

      {/*
        CABEÇALHO DO PAPEL. Na impressão o menu e a barra do topo saem, então sem isto
        a folha começaria direto num número, sem dizer que relatório é.
      */}
      <div className="hidden print:block">
        <h1 className="text-[18px] font-bold text-ink">Relatório imobiliário</h1>
      </div>

      {/*
        O recorte fica FORA do bloco que a impressão esconde.
        Estava dentro: o `print:block` no parágrafo não vencia, porque o pai era
        `display: none` — a folha saía sem dizer de que período era, que é justamente
        o que torna relatório impresso indefensável numa reunião.
      */}
      {(de || ate || corretor) && (
        <p className="text-[12px] text-ink-2">
          Recorte: <strong>{de ? de.split('-').reverse().join('/') : 'início'}</strong> a{' '}
          <strong>{ate ? ate.split('-').reverse().join('/') : 'hoje'}</strong>
          {nomeCorretor && <> · corretor <strong>{nomeCorretor}</strong></>}
        </p>
      )}
    </div>
  )
}
