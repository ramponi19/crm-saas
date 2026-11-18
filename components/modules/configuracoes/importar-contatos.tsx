'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, Check, AlertTriangle, Download, ArrowLeft } from 'lucide-react'
import { Card, Button, Select, notify } from '@/components/ui'
import { useFuso } from '@/components/fuso-provider'
import { formatarDataHora } from '@/lib/datas'
import { CAMPOS, csvDasRecusadas, MAX_LINHAS, type Mapa, type Recusada } from '@/lib/importacao'

interface Funil { id: number; nome: string; padrao: boolean; etapas: { id: number; nome: string }[] }
interface Historico { id: number; arquivo: string | null; total: number; novos: number; existentes: number; leads: number; recusadas: number; em: string }
interface Lida { arquivo: string; colunas: string[]; linhas: string[][] }
interface Previa {
  total: number; validas: number; recusadas: Recusada[]; contatosNovos: number; contatosExistentes: number; leadsACriar: number; semFunil: boolean
  amostra: { linha: number; nome: string; telefone: string; email: string | null; interesse: string | null; valor: number | null; existe: boolean }[]
}
interface Resultado { contatosNovos: number; contatosExistentes: number; leadsCriados: number; recusadas: Recusada[]; total: number }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Importar contatos e leads por planilha (18/11/2026, core): arquivo → mapeamento → prévia → gravar →
 * relatório. A prévia não grava nada; o relatório baixa as linhas recusadas em CSV com o motivo.
 */
export function ImportarContatos({ funis, equipe, historico }: { funis: Funil[]; equipe: { id: string; nome: string }[]; historico: Historico[] }) {
  const router = useRouter()
  const fuso = useFuso()
  const entrada = useRef<HTMLInputElement>(null)
  const [lendo, setLendo] = useState(false)
  const [lida, setLida] = useState<Lida | null>(null)
  const [mapa, setMapa] = useState<Mapa>({})
  const [criarLead, setCriarLead] = useState(true)
  const padrao = funis.find((f) => f.padrao) ?? funis[0]
  const [funilId, setFunilId] = useState<number | null>(padrao?.id ?? null)
  const [etapaId, setEtapaId] = useState<number | null>(null)
  const [responsavelId, setResponsavelId] = useState('')
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const funil = funis.find((f) => f.id === funilId) ?? null

  async function escolher(arq: File | undefined) {
    if (!arq) return
    setLendo(true); setPrevia(null); setResultado(null)
    const fd = new FormData(); fd.append('arquivo', arq)
    const r = await fetch('/api/importacao/ler', { method: 'POST', body: fd })
    const j = await r.json().catch(() => ({}))
    setLendo(false)
    if (entrada.current) entrada.current.value = ''
    if (!r.ok) { notify.bad(j.error ?? 'Não consegui ler a planilha'); return }
    setLida({ arquivo: j.arquivo, colunas: j.colunas, linhas: j.linhas })
    setMapa(j.mapa ?? {})
  }

  const corpo = (gravar: boolean) => JSON.stringify({
    arquivo: lida?.arquivo, linhas: lida?.linhas, mapa, criarLead, funilId, etapaId, responsavelId: responsavelId || null, gravar,
  })

  async function verPrevia() {
    if (mapa.telefone == null) { notify.bad('Escolha a coluna do telefone'); return }
    setOcupado(true)
    const r = await fetch('/api/importacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo(false) })
    const j = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) { notify.bad(j.error ?? 'Falha na prévia'); return }
    setPrevia(j)
  }

  async function gravar() {
    setOcupado(true)
    const r = await fetch('/api/importacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo(true) })
    const j = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) { notify.bad(j.error ?? 'Falha ao importar'); return }
    setResultado(j)
    notify.ok('Importação concluída')
    router.refresh()
  }

  function baixarRecusadas(recusadas: Recusada[]) {
    if (!lida) return
    const blob = new Blob([csvDasRecusadas(recusadas, lida.colunas, lida.linhas)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `recusadas-${lida.arquivo.replace(/\.[^.]+$/, '')}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  function recomecar() { setLida(null); setPrevia(null); setResultado(null); setMapa({}) }

  return (
    <>
      {!lida && (
        <Card title="Importar contatos e leads">
          <p className="text-[13px] text-ink-2">
            Planilha em .xlsx ou .csv, com uma linha de cabeçalho e até {MAX_LINHAS.toLocaleString('pt-BR')} linhas. O telefone é obrigatório:
            é por ele que o Nexus reconhece quem já está cadastrado. Antes de gravar você confere a prévia.
          </p>
          <input ref={entrada} type="file" accept=".xlsx,.csv,text/csv" className="hidden" aria-label="Arquivo da planilha"
            onChange={(e) => escolher(e.target.files?.[0])} />
          <Button className="mt-4" loading={lendo} icon={<Upload size={14} strokeWidth={1.7} />} onClick={() => entrada.current?.click()}>
            Escolher planilha
          </Button>
        </Card>
      )}

      {lida && !resultado && (
        <Card title={<span className="flex items-center gap-2"><FileSpreadsheet size={15} strokeWidth={1.7} /> {lida.arquivo} · {lida.linhas.length} linha{lida.linhas.length === 1 ? '' : 's'}</span>}
          actions={<Button size="sm" variant="ghost" icon={<ArrowLeft size={13} strokeWidth={1.7} />} onClick={recomecar}>Outra planilha</Button>}>
          <p className="mb-3 text-[12.5px] text-ink-2">Diga o que é cada coluna. As que ficarem em “não importar” são ignoradas.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAMPOS.map((c) => (
              <Select key={c.chave} label={c.rotulo} required={c.obrigatorio} value={mapa[c.chave] ?? ''}
                onChange={(e) => { setPrevia(null); setMapa((m) => ({ ...m, [c.chave]: e.target.value === '' ? undefined : Number(e.target.value) })) }}>
                <option value="">não importar</option>
                {lida.colunas.map((col, i) => <option key={i} value={i}>{col}</option>)}
              </Select>
            ))}
          </div>

          <div className="mt-5 border-t border-line-soft pt-4">
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={criarLead} onChange={(e) => { setCriarLead(e.target.checked); setPrevia(null) }} />
              Criar um lead no funil para cada contato
            </label>
            {criarLead && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Select label="Funil" value={funilId ?? ''} onChange={(e) => { setFunilId(Number(e.target.value) || null); setEtapaId(null); setPrevia(null) }}>
                  {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.padrao ? ' (padrão)' : ''}</option>)}
                </Select>
                <Select label="Etapa" value={etapaId ?? ''} onChange={(e) => { setEtapaId(Number(e.target.value) || null); setPrevia(null) }}>
                  <option value="">a primeira do funil</option>
                  {(funil?.etapas ?? []).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </Select>
                <Select label="Responsável" value={responsavelId} onChange={(e) => { setResponsavelId(e.target.value); setPrevia(null) }}>
                  <option value="">sem responsável (esteira)</option>
                  {equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </Select>
              </div>
            )}
            <p className="mt-2 text-[12px] text-ink-3">Todo contato importado ganha a etiqueta “importação”. Contato que já existe não é alterado.</p>
          </div>

          {!previa && (
            <Button className="mt-4" loading={ocupado} disabled={mapa.telefone == null} onClick={verPrevia}>Ver prévia</Button>
          )}

          {previa && (
            <div className="mt-5 space-y-3 border-t border-line-soft pt-4">
              <h3 className="text-[14px] font-semibold text-ink">Prévia (nada foi gravado ainda)</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Contatos novos', previa.contatosNovos], ['Já existiam', previa.contatosExistentes],
                  ['Leads a criar', previa.leadsACriar], ['Recusadas', previa.recusadas.length],
                ].map(([rot, n]) => (
                  <div key={rot as string} className="rounded-control border border-line px-3 py-2" data-previa={rot}>
                    <div className="num text-[18px] font-semibold text-ink">{n as number}</div>
                    <div className="text-[11.5px] text-ink-3">{rot}</div>
                  </div>
                ))}
              </div>
              {previa.semFunil && <p className="text-[12.5px] text-warn">A empresa não tem funil: os contatos entram sem lead.</p>}
              {previa.amostra.length > 0 && (
                <div className="overflow-x-auto rounded-control border border-line">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-raised text-left text-ink-3">
                      <tr><th className="px-3 py-1.5 font-medium">Linha</th><th className="px-3 py-1.5 font-medium">Nome</th><th className="px-3 py-1.5 font-medium">Telefone</th><th className="px-3 py-1.5 font-medium">E-mail</th><th className="px-3 py-1.5 font-medium">Interesse</th><th className="px-3 py-1.5 font-medium">Valor</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {previa.amostra.map((a) => (
                        <tr key={a.linha}>
                          <td className="num px-3 py-1.5 text-ink-3">{a.linha}</td>
                          <td className="px-3 py-1.5 text-ink">{a.nome}{a.existe && <span className="ml-1.5 text-[11px] text-ink-3">(já existe)</span>}</td>
                          <td className="num px-3 py-1.5 text-ink-2">{a.telefone}</td>
                          <td className="px-3 py-1.5 text-ink-2">{a.email ?? '—'}</td>
                          <td className="px-3 py-1.5 text-ink-2">{a.interesse ?? '—'}</td>
                          <td className="num px-3 py-1.5 text-ink-2">{a.valor == null ? '—' : brl(a.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <ListaRecusadas recusadas={previa.recusadas} onBaixar={() => baixarRecusadas(previa.recusadas)} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPrevia(null)} disabled={ocupado}>Ajustar</Button>
                <Button loading={ocupado} disabled={previa.validas === 0} icon={<Check size={14} strokeWidth={1.7} />} onClick={gravar}>
                  Importar {previa.validas} contato{previa.validas === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {resultado && (
        <Card title="Importação concluída">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Contatos novos', resultado.contatosNovos], ['Já existiam', resultado.contatosExistentes],
              ['Leads criados', resultado.leadsCriados], ['Recusadas', resultado.recusadas.length],
            ].map(([rot, n]) => (
              <div key={rot as string} className="rounded-control border border-line px-3 py-2" data-resultado={rot}>
                <div className="num text-[18px] font-semibold text-ink">{n as number}</div>
                <div className="text-[11.5px] text-ink-3">{rot}</div>
              </div>
            ))}
          </div>
          <div className="mt-3"><ListaRecusadas recusadas={resultado.recusadas} onBaixar={() => baixarRecusadas(resultado.recusadas)} /></div>
          <p className="mt-3 text-[12.5px] text-ink-2">Os contatos estão com a etiqueta “importação”: filtre por ela no funil ou na Comunicação.</p>
          <Button className="mt-4" variant="outline" onClick={recomecar}>Importar outra planilha</Button>
        </Card>
      )}

      {historico.length > 0 && (
        <Card title="Importações anteriores">
          <ul className="divide-y divide-line-soft text-[12.5px]">
            {historico.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-ink">{h.arquivo ?? 'planilha'} <span className="text-ink-3">· {formatarDataHora(h.em, undefined, '', fuso)}</span></span>
                <span className="num text-ink-2">{h.total} linhas · {h.novos} novos · {h.existentes} já existiam · {h.leads} leads · {h.recusadas} recusadas</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function ListaRecusadas({ recusadas, onBaixar }: { recusadas: Recusada[]; onBaixar: () => void }) {
  if (recusadas.length === 0) return null
  return (
    <div className="rounded-control border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink"><AlertTriangle size={14} strokeWidth={1.7} className="text-warn" /> {recusadas.length} linha{recusadas.length === 1 ? '' : 's'} recusada{recusadas.length === 1 ? '' : 's'}</span>
        <Button size="sm" variant="outline" icon={<Download size={13} strokeWidth={1.7} />} onClick={onBaixar}>Baixar relatório</Button>
      </div>
      <ul className="max-h-48 divide-y divide-line-soft overflow-y-auto text-[12.5px]">
        {recusadas.slice(0, 200).map((r) => (
          <li key={r.linha} className="flex gap-3 px-3 py-1.5"><span className="num w-16 flex-none text-ink-3">linha {r.linha}</span><span className="text-ink-2">{r.motivo}</span></li>
        ))}
      </ul>
    </div>
  )
}
