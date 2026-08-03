'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, KeyRound, ArrowRightLeft, Undo2 } from 'lucide-react'
import { Card, Button, Input, Select, Modal, Badge, EmptyState, notify } from '@/components/ui'

export interface Chave {
  id: number
  imovel_id: number | null
  codigo: string | null
  status: string
  com_quem: string | null
  retirada_em: string | null
  devolucao_prevista: string | null
  observacoes: string | null
  imovel_titulo: string | null
  imovel_codigo: string | null
}

type Imovel = { id: number; codigo: string | null; titulo: string | null }

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' }> = {
  na_imobiliaria: { label: 'Na imobiliária', tone: 'ok' },
  emprestada: { label: 'Emprestada', tone: 'warn' },
}
const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
const imovelLabel = (im: Imovel | Chave) => [('imovel_codigo' in im ? im.imovel_codigo : im.codigo), ('imovel_titulo' in im ? im.imovel_titulo : im.titulo)].filter(Boolean).join(' · ') || 'Imóvel'

export function ChavesView({ initial, empresaId, imoveis }: { initial: Chave[]; empresaId: number; imoveis: Imovel[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [nova, setNova] = useState(false)
  const [imovelId, setImovelId] = useState('')
  const [codigo, setCodigo] = useState('')
  const [salvando, setSalvando] = useState(false)
  // empréstimo
  const [emprestar, setEmprestar] = useState<Chave | null>(null)
  const [comQuem, setComQuem] = useState('')
  const [devolucao, setDevolucao] = useState('')

  async function criar() {
    if (!imovelId) { notify.warn('Selecione o imóvel'); return }
    setSalvando(true)
    const { error } = await supabase.from('chaves_imoveis').insert({
      empresa_id: empresaId, imovel_id: Number(imovelId), codigo: codigo.trim() || null, status: 'na_imobiliaria',
    })
    setSalvando(false)
    if (error) { notify.bad('Erro ao cadastrar', error.message); return }
    notify.ok('Chave cadastrada')
    setNova(false); setImovelId(''); setCodigo('')
    router.refresh()
  }

  async function confirmarEmprestimo() {
    if (!emprestar) return
    if (!comQuem.trim()) { notify.warn('Informe com quem fica a chave'); return }
    setSalvando(true)
    const { error } = await supabase.from('chaves_imoveis').update({
      status: 'emprestada', com_quem: comQuem.trim(),
      retirada_em: new Date().toISOString(), devolucao_prevista: devolucao || null,
    }).eq('id', emprestar.id)
    setSalvando(false)
    if (error) { notify.bad('Erro ao registrar', error.message); return }
    notify.ok('Empréstimo registrado')
    setEmprestar(null); setComQuem(''); setDevolucao('')
    router.refresh()
  }

  async function devolver(c: Chave) {
    const { error } = await supabase.from('chaves_imoveis').update({
      status: 'na_imobiliaria', com_quem: null, retirada_em: null, devolucao_prevista: null,
    }).eq('id', c.id)
    if (error) { notify.bad('Erro ao devolver'); return }
    notify.ok('Chave devolvida'); router.refresh()
  }

  async function remover(c: Chave) {
    if (!window.confirm('Remover esta chave?')) return
    const { error } = await supabase.from('chaves_imoveis').delete().eq('id', c.id)
    if (error) { notify.bad('Erro ao remover'); return }
    router.refresh()
  }

  const atrasada = (c: Chave) => c.status === 'emprestada' && c.devolucao_prevista && new Date(c.devolucao_prevista) < new Date(new Date().toDateString())

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[900px] space-y-4">
        <div className="flex justify-end">
          <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={() => setNova(true)}>Nova chave</Button>
        </div>

        <Card flush>
          {initial.length === 0 ? (
            <div className="p-6"><EmptyState icon={<KeyRound size={22} strokeWidth={1.7} />} title="Nenhuma chave" description="Cadastre as chaves dos imóveis para controlar retiradas e devoluções." /></div>
          ) : (
            <div className="divide-y divide-line-soft">
              {initial.map((c) => {
                const st = STATUS[c.status] ?? STATUS.na_imobiliaria
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-[180px] flex-1">
                      <div className="text-[14px] font-semibold text-ink">{imovelLabel(c)}</div>
                      <div className="text-[12px] text-ink-3">
                        Chave {c.codigo || '—'}
                        {c.status === 'emprestada' && <> · com <span className="text-ink-2">{c.com_quem}</span> · devolução {fmtData(c.devolucao_prevista)}</>}
                      </div>
                    </div>
                    {atrasada(c) && <Badge tone="bad">atrasada</Badge>}
                    <Badge tone={st.tone} dot={st.tone === 'ok'}>{st.label}</Badge>
                    {c.status === 'na_imobiliaria' ? (
                      <Button variant="outline" size="sm" icon={<ArrowRightLeft size={14} strokeWidth={1.7} />} onClick={() => { setEmprestar(c); setComQuem(''); setDevolucao('') }}>Emprestar</Button>
                    ) : (
                      <Button variant="outline" size="sm" icon={<Undo2 size={14} strokeWidth={1.7} />} onClick={() => devolver(c)}>Devolver</Button>
                    )}
                    <Button variant="ghost" size="sm" icon={<Trash2 size={14} strokeWidth={1.7} />} className="text-bad hover:bg-bad/10" onClick={() => remover(c)}><span className="sr-only">Remover</span></Button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Nova chave */}
      <Modal open={nova} onClose={() => !salvando && setNova(false)} title="Nova chave"
        footer={<><Button variant="ghost" onClick={() => setNova(false)} disabled={salvando}>Cancelar</Button><Button onClick={criar} loading={salvando}>Cadastrar</Button></>}>
        <div className="space-y-3">
          <Select label="Imóvel" value={imovelId} onChange={(e) => setImovelId(e.target.value)}>
            <option value="">Selecionar imóvel…</option>
            {imoveis.map((im) => <option key={im.id} value={im.id}>{imovelLabel(im)}</option>)}
          </Select>
          <Input label="Código da chave" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex: CH-014" />
        </div>
      </Modal>

      {/* Emprestar */}
      <Modal open={emprestar !== null} onClose={() => !salvando && setEmprestar(null)} title="Emprestar chave"
        footer={<><Button variant="ghost" onClick={() => setEmprestar(null)} disabled={salvando}>Cancelar</Button><Button onClick={confirmarEmprestimo} loading={salvando}>Confirmar</Button></>}>
        <div className="space-y-3">
          {emprestar && <p className="text-[13px] text-ink-2">{imovelLabel(emprestar)} · chave {emprestar.codigo || '—'}</p>}
          <Input label="Com quem fica" value={comQuem} onChange={(e) => setComQuem(e.target.value)} placeholder="Corretor ou cliente" />
          <Input label="Devolução prevista" type="date" className="num" value={devolucao} onChange={(e) => setDevolucao(e.target.value)} />
        </div>
      </Modal>
    </main>
  )
}
