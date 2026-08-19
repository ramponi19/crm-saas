'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Plus, Pencil, Trash2, X, Loader2, Home, Search, ImagePlus, Share2, Globe } from 'lucide-react'
import { Button, IconButton, Input, Select, Textarea, Modal, ConfirmDialog, Card, Badge, EmptyState, notify } from '@/components/ui'
import type { Tables, TablesInsert } from '@/types/database'

type Imovel = Tables<'imoveis'>
type ProprietarioMin = { id: number; nome: string }

const TIPOS = ['apartamento', 'casa', 'terreno', 'comercial', 'sala', 'galpao', 'cobertura', 'sitio']
const FINALIDADES = [{ v: 'venda', l: 'Venda' }, { v: 'locacao', l: 'Locação' }, { v: 'ambos', l: 'Venda e Locação' }]
const STATUS = [
  { v: 'disponivel', l: 'Disponível' },
  { v: 'reservado', l: 'Reservado' },
  { v: 'vendido', l: 'Vendido' },
  { v: 'alugado', l: 'Alugado' },
  { v: 'inativo', l: 'Inativo' },
]
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'acc' | 'neutro'> = {
  disponivel: 'ok', reservado: 'warn', vendido: 'acc', alugado: 'acc', inativo: 'neutro',
}

const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Campo no escopo do módulo (identidade estável — não perde foco ao digitar)
function Campo({ label, value, onChange, ph, tipo = 'text' }: { label: string; value: string; onChange: (v: string) => void; ph?: string; tipo?: string }) {
  return (
    <Input label={label} type={tipo} value={value} onChange={e => onChange(e.target.value)} placeholder={ph} />
  )
}

function Secao({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</p>
}

const vazio = {
  codigo: '', titulo: '', tipo: 'apartamento', finalidade: 'venda', status: 'disponivel', proprietario_id: '',
  valor_venda: '', valor_locacao: '', valor_condominio: '', valor_iptu: '', iptu_periodicidade: 'anual',
  area_util: '', area_total: '', quartos: '', suites: '', banheiros: '', vagas: '',
  matricula: '', status_chaves: '',
  captado_por: '', captado_em: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  descricao: '',
  ocultar_numero_publico: false, aceita_permuta: false, aceita_financiamento: false, publicar_portais: false,
}
type FormT = typeof vazio

export default function ImoveisView({ inicial, proprietarios, equipe, empresaId, slug }: { inicial: Imovel[]; proprietarios: ProprietarioMin[]; equipe: { id: string; nome: string }[]; empresaId: number; slug: string }) {
  const supabase = createClient()
  const [lista, setLista] = useState<Imovel[]>(inicial)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Imovel | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormT>(vazio)
  const [fotos, setFotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [confirmDel, setConfirmDel] = useState<Imovel | null>(null)

  const set = (k: keyof FormT, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  async function enviarFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${empresaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('imoveis').upload(path, file, { cacheControl: '3600', upsert: false })
      if (error) { notify.bad('Falha ao enviar foto: ' + error.message); continue }
      const { data } = supabase.storage.from('imoveis').getPublicUrl(path)
      setFotos(f => [...f, data.publicUrl])
    }
    setUploading(false)
  }
  const removerFoto = (url: string) => setFotos(f => f.filter(u => u !== url))

  async function compartilhar(im: Imovel) {
    const url = `${window.location.origin}/imovel/${im.id}`
    try {
      await navigator.clipboard.writeText(url)
      notify.ok('Link público copiado!')
    } catch {
      window.open(url, '_blank')
    }
  }

  const str = (k: keyof FormT) => (v: string) => set(k, v)
  const n = (v: string) => (v.trim() === '' ? null : Number(v))
  const i = (v: string) => (v.trim() === '' ? null : parseInt(v, 10))

  function abrirNovo() { setEditando(null); setForm(vazio); setFotos([]); setModal(true) }
  function abrirEdit(im: Imovel) {
    setEditando(im)
    setFotos(Array.isArray(im.fotos) ? (im.fotos as string[]) : [])
    setForm({
      codigo: im.codigo ?? '', titulo: im.titulo ?? '', tipo: im.tipo, finalidade: im.finalidade, status: im.status,
      proprietario_id: im.proprietario_id ? String(im.proprietario_id) : '',
      valor_venda: im.valor_venda?.toString() ?? '', valor_locacao: im.valor_locacao?.toString() ?? '',
      valor_condominio: im.valor_condominio?.toString() ?? '', valor_iptu: im.valor_iptu?.toString() ?? '',
      iptu_periodicidade: im.iptu_periodicidade ?? 'anual',
      area_util: im.area_util?.toString() ?? '', area_total: im.area_total?.toString() ?? '',
      quartos: im.quartos?.toString() ?? '', suites: im.suites?.toString() ?? '', banheiros: im.banheiros?.toString() ?? '', vagas: im.vagas?.toString() ?? '',
      matricula: im.matricula ?? '', status_chaves: im.status_chaves ?? '',
      captado_por: im.captado_por ?? '', captado_em: im.captado_em ?? '',
      cep: im.cep ?? '', logradouro: im.logradouro ?? '', numero: im.numero ?? '', complemento: im.complemento ?? '', bairro: im.bairro ?? '', cidade: im.cidade ?? '', uf: im.uf ?? '',
      descricao: im.descricao ?? '',
      ocultar_numero_publico: !!im.ocultar_numero_publico, aceita_permuta: !!im.aceita_permuta, aceita_financiamento: !!im.aceita_financiamento, publicar_portais: !!im.publicar_portais,
    })
    setModal(true)
  }

  async function salvar() {
    if (!form.titulo.trim() && !form.codigo.trim()) { notify.bad('Informe ao menos o título ou o código'); return }
    setLoading(true)
    const payload: TablesInsert<'imoveis'> = {
      empresa_id: empresaId,
      codigo: form.codigo || null, titulo: form.titulo || null,
      tipo: form.tipo, finalidade: form.finalidade, status: form.status,
      proprietario_id: i(form.proprietario_id),
      valor_venda: n(form.valor_venda), valor_locacao: n(form.valor_locacao),
      valor_condominio: n(form.valor_condominio), valor_iptu: n(form.valor_iptu), iptu_periodicidade: form.iptu_periodicidade,
      area_util: n(form.area_util), area_total: n(form.area_total),
      quartos: i(form.quartos), suites: i(form.suites), banheiros: i(form.banheiros), vagas: i(form.vagas),
      matricula: form.matricula || null, status_chaves: form.status_chaves || null,
      // Quem captou alimenta "Captações" no ranking e o rateio da comissão do
      // negócio. Vazio é resposta válida: imóvel vindo de portal não tem captador.
      captado_por: form.captado_por || null,
      captado_em: form.captado_em || null,
      cep: form.cep || null, logradouro: form.logradouro || null, numero: form.numero || null, complemento: form.complemento || null,
      bairro: form.bairro || null, cidade: form.cidade || null, uf: form.uf || null,
      descricao: form.descricao || null,
      fotos: fotos,
      ocultar_numero_publico: form.ocultar_numero_publico, aceita_permuta: form.aceita_permuta,
      aceita_financiamento: form.aceita_financiamento, publicar_portais: form.publicar_portais,
    }
    if (editando) {
      const { data, error } = await supabase.from('imoveis').update(payload).eq('id', editando.id).select('*').single()
      if (error) { notify.bad(error.message); setLoading(false); return }
      setLista(l => l.map(x => (x.id === editando.id ? data : x)))
      notify.ok('Imóvel atualizado')
    } else {
      const { data, error } = await supabase.from('imoveis').insert(payload).select('*').single()
      if (error) { notify.bad(error.message); setLoading(false); return }
      setLista(l => [data, ...l])
      notify.ok('Imóvel cadastrado')
    }
    setLoading(false); setModal(false)
  }

  async function excluir(im: Imovel) {
    const { error } = await supabase.from('imoveis').delete().eq('id', im.id)
    if (error) { notify.bad(error.message); return }
    setLista(l => l.filter(x => x.id !== im.id))
    notify.ok('Imóvel excluído')
  }

  const filtrada = lista.filter(im =>
    (im.titulo ?? '').toLowerCase().includes(busca.toLowerCase()) ||
    (im.codigo ?? '').toLowerCase().includes(busca.toLowerCase()) ||
    (im.bairro ?? '').toLowerCase().includes(busca.toLowerCase()) ||
    (im.cidade ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Imóveis" />

      <div className="flex shrink-0 items-center gap-3 px-6 py-4">
        <Input
          wrapperClassName="w-full max-w-[380px]"
          icon={<Search size={15} strokeWidth={1.7} />}
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por título, código, bairro, cidade…"
        />
        <div className="ml-auto flex items-center gap-2">
          {slug && (
            <a
              href={`/imob/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-card px-4 text-[13px] font-medium tracking-[-0.01em] text-ink transition-colors hover:bg-bg"
            >
              <Globe size={15} strokeWidth={1.7} /> Site
            </a>
          )}
          <Button icon={<Plus size={15} strokeWidth={1.7} />} onClick={abrirNovo}>Novo imóvel</Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="mx-auto max-w-[1200px]">
          {filtrada.length === 0 ? (
            <Card flush>
              <EmptyState
                icon={<Home size={22} strokeWidth={1.7} />}
                title={`Nenhum imóvel ${busca ? 'encontrado' : 'cadastrado ainda'}`}
                description={busca ? 'Tente outro termo de busca.' : 'Cadastre seu primeiro imóvel.'}
                action={!busca ? <Button size="sm" onClick={abrirNovo}>Novo imóvel</Button> : undefined}
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtrada.map(im => {
                const st = STATUS.find(s => s.v === im.status)
                return (
                  <div key={im.id} className="overflow-hidden rounded-card border border-line bg-card transition-colors hover:border-ink/20">
                    {Array.isArray(im.fotos) && (im.fotos as string[])[0] && (
                      <div className="h-[150px] bg-raised">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={(im.fotos as string[])[0]} alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="num text-[11px] text-ink-3">{im.codigo || `#${im.id}`}</div>
                          <div className="truncate text-[14px] font-semibold text-ink">{im.titulo || cap(im.tipo)}</div>
                        </div>
                        <Badge tone={STATUS_TONE[im.status] ?? 'neutro'} dot={im.status === 'disponivel'}>{st?.l ?? im.status}</Badge>
                      </div>
                      <div className="mb-3 text-[12.5px] text-ink-2">
                        {cap(im.tipo)} · {(im.bairro || im.cidade) ? [im.bairro, im.cidade].filter(Boolean).join(', ') : 'sem endereço'}
                      </div>
                      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
                        {im.quartos ? <span>{im.quartos} qto</span> : null}
                        {im.vagas ? <span>{im.vagas} vaga</span> : null}
                        {im.area_util ? <span>{im.area_util} m²</span> : null}
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          {im.valor_venda ? <div className="num text-[15px] font-bold text-ink">{brl(im.valor_venda)}</div> : null}
                          {im.valor_locacao ? <div className="num text-[12.5px] text-ink-2">{brl(im.valor_locacao)}/mês</div> : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <IconButton size="sm" aria-label="Compartilhar" onClick={() => compartilhar(im)}><Share2 size={15} strokeWidth={1.7} /></IconButton>
                          <IconButton size="sm" aria-label="Editar" onClick={() => abrirEdit(im)}><Pencil size={15} strokeWidth={1.7} /></IconButton>
                          <IconButton size="sm" variant="danger" aria-label="Excluir" onClick={() => setConfirmDel(im)}><Trash2 size={15} strokeWidth={1.7} /></IconButton>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modal}
        onClose={() => { if (!loading) setModal(false) }}
        size="lg"
        disableOverlayClose={loading}
        title={editando ? 'Editar imóvel' : 'Novo imóvel'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={salvar} loading={loading}>Salvar imóvel</Button>
          </>
        }
      >
        <Secao>Identificação</Secao>
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Código" value={form.codigo} onChange={str('codigo')} ph="Ex: AP-102" />
          <Campo label="Título" value={form.titulo} onChange={str('titulo')} ph="Ex: Apto 2 quartos no Centro" />
          <Select label="Tipo" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            {TIPOS.map(t => <option key={t} value={t}>{cap(t)}</option>)}
          </Select>
          <Select label="Finalidade" value={form.finalidade} onChange={e => set('finalidade', e.target.value)}>
            {FINALIDADES.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
          </Select>
          <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
          </Select>
          <Select label="Proprietário" value={form.proprietario_id} onChange={e => set('proprietario_id', e.target.value)}>
            <option value="">— nenhum —</option>
            {proprietarios.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </Select>
          {/* Captação: é o que o ranking do corretor mede e o que o negócio usa
              para saber com quem dividir a comissão. Sem este campo a coluna do
              banco ficava sempre nula — campo sem caminho na tela não existe. */}
          <Select label="Captado por" value={form.captado_por} onChange={e => set('captado_por', e.target.value)}>
            <option value="">— não informado —</option>
            {equipe.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </Select>
          <Campo label="Captado em" tipo="date" value={form.captado_em} onChange={str('captado_em')} />
        </div>

        <Secao>Fotos</Secao>
        <div className="mb-5 flex flex-wrap gap-2">
          {fotos.map(url => (
            <div key={url} className="relative h-[84px] w-[84px] overflow-hidden rounded-control border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Foto do imóvel" className="h-full w-full object-cover" />
              <button type="button" onClick={() => removerFoto(url)} className="absolute right-1 top-1 rounded-full bg-ink/70 p-0.5 text-white transition-colors hover:bg-ink" aria-label="Remover foto">
                <X size={12} strokeWidth={1.7} />
              </button>
            </div>
          ))}
          <label className="flex h-[84px] w-[84px] cursor-pointer flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed border-line text-ink-3 transition-colors hover:border-accent hover:text-accent">
            {uploading
              ? <Loader2 size={18} strokeWidth={1.7} className="animate-spin" />
              : <><ImagePlus size={18} strokeWidth={1.7} /><span className="text-[9px]">Adicionar</span></>}
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => enviarFotos(e.target.files)} disabled={uploading} />
          </label>
        </div>

        <Secao>Valores</Secao>
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Valor de venda (R$)" value={form.valor_venda} onChange={str('valor_venda')} tipo="number" />
          <Campo label="Valor de locação (R$)" value={form.valor_locacao} onChange={str('valor_locacao')} tipo="number" />
          <Campo label="Condomínio (R$)" value={form.valor_condominio} onChange={str('valor_condominio')} tipo="number" />
          <Campo label="IPTU (R$)" value={form.valor_iptu} onChange={str('valor_iptu')} tipo="number" />
          <Select label="Periodicidade do IPTU" value={form.iptu_periodicidade} onChange={e => set('iptu_periodicidade', e.target.value)}>
            <option value="anual">Anual</option>
            <option value="mensal">Mensal</option>
          </Select>
        </div>

        <Secao>Características</Secao>
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo label="Área útil (m²)" value={form.area_util} onChange={str('area_util')} tipo="number" />
          <Campo label="Área total (m²)" value={form.area_total} onChange={str('area_total')} tipo="number" />
          <Campo label="Quartos" value={form.quartos} onChange={str('quartos')} tipo="number" />
          <Campo label="Suítes" value={form.suites} onChange={str('suites')} tipo="number" />
          <Campo label="Banheiros" value={form.banheiros} onChange={str('banheiros')} tipo="number" />
          <Campo label="Vagas" value={form.vagas} onChange={str('vagas')} tipo="number" />
          <Campo label="Matrícula" value={form.matricula} onChange={str('matricula')} />
          <Campo label="Chaves" value={form.status_chaves} onChange={str('status_chaves')} ph="Ex: na imobiliária" />
        </div>

        <Secao>Endereço</Secao>
        <div className="mb-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo label="CEP" value={form.cep} onChange={str('cep')} />
          <div className="col-span-2"><Campo label="Logradouro" value={form.logradouro} onChange={str('logradouro')} /></div>
          <Campo label="Número" value={form.numero} onChange={str('numero')} />
          <Campo label="Complemento" value={form.complemento} onChange={str('complemento')} />
          <Campo label="Bairro" value={form.bairro} onChange={str('bairro')} />
          <Campo label="Cidade" value={form.cidade} onChange={str('cidade')} />
          <Campo label="UF" value={form.uf} onChange={str('uf')} />
        </div>
        <label className="mb-5 flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={form.ocultar_numero_publico} onChange={e => set('ocultar_numero_publico', e.target.checked)} />
          Ocultar número no anúncio público
        </label>

        <Secao>Opções</Secao>
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-2">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-accent" checked={form.aceita_permuta} onChange={e => set('aceita_permuta', e.target.checked)} /> Aceita permuta</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-accent" checked={form.aceita_financiamento} onChange={e => set('aceita_financiamento', e.target.checked)} /> Aceita financiamento</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-accent" checked={form.publicar_portais} onChange={e => set('publicar_portais', e.target.checked)} /> Publicar nos portais</label>
        </div>
        <Textarea label="Descrição" rows={3} value={form.descricao} onChange={e => set('descricao', e.target.value)} />
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={async () => { const im = confirmDel; setConfirmDel(null); if (im) await excluir(im) }}
        title="Excluir imóvel?"
        description={`"${confirmDel?.titulo || confirmDel?.codigo || confirmDel?.id}" será removido permanentemente.`}
        confirmLabel="Excluir"
        tone="danger"
      />
    </div>
  )
}
