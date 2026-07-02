'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Plus, Pencil, Trash2, X, Loader2, Home, Search, ImagePlus, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Tables, TablesInsert } from '@/types/database'

type Imovel = Tables<'imoveis'>
type ProprietarioMin = { id: number; nome: string }

const TIPOS = ['apartamento', 'casa', 'terreno', 'comercial', 'sala', 'galpao', 'cobertura', 'sitio']
const FINALIDADES = [{ v: 'venda', l: 'Venda' }, { v: 'locacao', l: 'Locação' }, { v: 'ambos', l: 'Venda e Locação' }]
const STATUS = [
  { v: 'disponivel', l: 'Disponível', c: '#16A34A' },
  { v: 'reservado', l: 'Reservado', c: '#D97706' },
  { v: 'vendido', l: 'Vendido', c: '#2563EB' },
  { v: 'alugado', l: 'Alugado', c: '#7C3AED' },
  { v: 'inativo', l: 'Inativo', c: '#6B7280' },
]

const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const INPUT = 'w-full bg-[rgba(22,32,46,.04)] border border-[rgba(22,32,46,.12)] rounded-[10px] px-3 py-2.5 text-[14px] text-[#16212E] outline-none focus:border-[rgba(22,32,46,.35)] transition-colors'
const LBL = 'block font-mono text-[10px] tracking-[0.12em] text-[#788698] mb-1.5'

// Campo no escopo do módulo (identidade estável — não perde foco ao digitar)
function Campo({ label, value, onChange, ph, tipo = 'text' }: { label: string; value: string; onChange: (v: string) => void; ph?: string; tipo?: string }) {
  return (
    <div>
      <label className={LBL}>{label}</label>
      <input type={tipo} value={value} onChange={e => onChange(e.target.value)} placeholder={ph} className={INPUT} />
    </div>
  )
}

const vazio = {
  codigo: '', titulo: '', tipo: 'apartamento', finalidade: 'venda', status: 'disponivel', proprietario_id: '',
  valor_venda: '', valor_locacao: '', valor_condominio: '', valor_iptu: '', iptu_periodicidade: 'anual',
  area_util: '', area_total: '', quartos: '', suites: '', banheiros: '', vagas: '',
  matricula: '', status_chaves: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  descricao: '',
  ocultar_numero_publico: false, aceita_permuta: false, aceita_financiamento: false, publicar_portais: false,
}
type FormT = typeof vazio

export default function ImoveisView({ inicial, proprietarios, empresaId, slug, leadsToken }: { inicial: Imovel[]; proprietarios: ProprietarioMin[]; empresaId: number; slug: string; leadsToken: string }) {
  const supabase = createClient()
  const [lista, setLista] = useState<Imovel[]>(inicial)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Imovel | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormT>(vazio)
  const [fotos, setFotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const set = (k: keyof FormT, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  async function enviarFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${empresaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('imoveis').upload(path, file, { cacheControl: '3600', upsert: false })
      if (error) { toast.error('Falha ao enviar foto: ' + error.message); continue }
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
      toast.success('Link público copiado!')
    } catch {
      window.open(url, '_blank')
    }
  }

  async function copiarFeed() {
    const url = `${window.location.origin}/api/portais/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('URL do feed copiada! Cole no painel do portal (ZAP/VivaReal/OLX).')
    } catch {
      window.open(url, '_blank')
    }
  }

  async function copiarLeadsUrl() {
    const url = `${window.location.origin}/api/portais/${slug}/leads?token=${leadsToken}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('URL de leads copiada! Cole no Canal Pro (Integrações → Receber leads no CRM).')
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
      cep: im.cep ?? '', logradouro: im.logradouro ?? '', numero: im.numero ?? '', complemento: im.complemento ?? '', bairro: im.bairro ?? '', cidade: im.cidade ?? '', uf: im.uf ?? '',
      descricao: im.descricao ?? '',
      ocultar_numero_publico: !!im.ocultar_numero_publico, aceita_permuta: !!im.aceita_permuta, aceita_financiamento: !!im.aceita_financiamento, publicar_portais: !!im.publicar_portais,
    })
    setModal(true)
  }

  async function salvar() {
    if (!form.titulo.trim() && !form.codigo.trim()) { toast.error('Informe ao menos o título ou o código'); return }
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
      cep: form.cep || null, logradouro: form.logradouro || null, numero: form.numero || null, complemento: form.complemento || null,
      bairro: form.bairro || null, cidade: form.cidade || null, uf: form.uf || null,
      descricao: form.descricao || null,
      fotos: fotos,
      ocultar_numero_publico: form.ocultar_numero_publico, aceita_permuta: form.aceita_permuta,
      aceita_financiamento: form.aceita_financiamento, publicar_portais: form.publicar_portais,
    }
    if (editando) {
      const { data, error } = await supabase.from('imoveis').update(payload).eq('id', editando.id).select('*').single()
      if (error) { toast.error(error.message); setLoading(false); return }
      setLista(l => l.map(x => (x.id === editando.id ? data : x)))
      toast.success('Imóvel atualizado')
    } else {
      const { data, error } = await supabase.from('imoveis').insert(payload).select('*').single()
      if (error) { toast.error(error.message); setLoading(false); return }
      setLista(l => [data, ...l])
      toast.success('Imóvel cadastrado')
    }
    setLoading(false); setModal(false)
  }

  async function excluir(im: Imovel) {
    if (!confirm(`Excluir o imóvel "${im.titulo || im.codigo || im.id}"?`)) return
    const { error } = await supabase.from('imoveis').delete().eq('id', im.id)
    if (error) { toast.error(error.message); return }
    setLista(l => l.filter(x => x.id !== im.id))
    toast.success('Imóvel excluído')
  }

  const filtrada = lista.filter(im =>
    (im.titulo ?? '').toLowerCase().includes(busca.toLowerCase()) ||
    (im.codigo ?? '').toLowerCase().includes(busca.toLowerCase()) ||
    (im.bairro ?? '').toLowerCase().includes(busca.toLowerCase()) ||
    (im.cidade ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <>
      <Topbar eyebrow="IMOBILIÁRIA" title="Imóveis" />

      <div className="p-6 max-w-[1200px]">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="relative flex-1 max-w-[380px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA7B6]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título, código, bairro, cidade..." className={`${INPUT} pl-9`} />
          </div>
          <button onClick={abrirNovo} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-white bg-[#16212E] hover:bg-[#22303f] transition-colors shrink-0">
            <Plus size={17} /> Novo imóvel
          </button>
        </div>

        {slug && (
          <div className="mb-5 bg-[#C9A24B]/[0.08] border border-[#C9A24B]/25 rounded-[10px] px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="font-semibold text-[#8A6D2B] shrink-0">📤 Feed de imóveis (portais):</span>
              <code className="truncate text-[#56657A]">/api/portais/{slug}</code>
              <button onClick={copiarFeed} className="ml-auto text-[12px] font-semibold text-[#8A6D2B] hover:underline shrink-0">Copiar</button>
            </div>
            <div className="flex items-center gap-2 text-[12.5px] border-t border-[#C9A24B]/20 pt-1.5">
              <span className="font-semibold text-[#8A6D2B] shrink-0">📥 Receber leads (Canal Pro):</span>
              <code className="truncate text-[#56657A]">/api/portais/{slug}/leads?token=•••</code>
              <button onClick={copiarLeadsUrl} className="ml-auto text-[12px] font-semibold text-[#8A6D2B] hover:underline shrink-0">Copiar</button>
            </div>
          </div>
        )}

        {filtrada.length === 0 ? (
          <div className="text-center py-20 text-[#788698]">
            <Home size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-[14px]">Nenhum imóvel {busca ? 'encontrado' : 'cadastrado ainda'}.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtrada.map(im => {
              const st = STATUS.find(s => s.v === im.status)
              return (
                <div key={im.id} className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-4 overflow-hidden hover:shadow-[0_10px_30px_rgba(22,35,50,.08)] transition-shadow">
                  {Array.isArray(im.fotos) && (im.fotos as string[])[0] && (
                    <div className="-mx-4 -mt-4 mb-3 h-[150px] bg-[#16212E]/[0.04]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={(im.fotos as string[])[0]} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono text-[#9AA7B6]">{im.codigo || `#${im.id}`}</div>
                      <div className="text-[15px] font-bold text-[#16212E] truncate">{im.titulo || cap(im.tipo)}</div>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-full shrink-0" style={{ background: `${st?.c ?? '#6B7280'}18`, color: st?.c ?? '#6B7280' }}>{st?.l ?? im.status}</span>
                  </div>
                  <div className="text-[12.5px] text-[#788698] mb-3">
                    {cap(im.tipo)} · {(im.bairro || im.cidade) ? [im.bairro, im.cidade].filter(Boolean).join(', ') : 'sem endereço'}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#56657A] mb-3">
                    {im.quartos ? <span>{im.quartos} qto</span> : null}
                    {im.vagas ? <span>{im.vagas} vaga</span> : null}
                    {im.area_util ? <span>{im.area_util} m²</span> : null}
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      {im.valor_venda ? <div className="text-[15px] font-extrabold text-[#16212E]">{brl(im.valor_venda)}</div> : null}
                      {im.valor_locacao ? <div className="text-[12.5px] text-[#56657A]">{brl(im.valor_locacao)}/mês</div> : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => compartilhar(im)} className="p-2 rounded-[8px] text-[#788698] hover:bg-[#16212E]/[0.06] hover:text-[#16212E]" aria-label="Compartilhar"><Share2 size={15} /></button>
                      <button onClick={() => abrirEdit(im)} className="p-2 rounded-[8px] text-[#788698] hover:bg-[#16212E]/[0.06] hover:text-[#16212E]" aria-label="Editar"><Pencil size={15} /></button>
                      <button onClick={() => excluir(im)} className="p-2 rounded-[8px] text-[#788698] hover:bg-[#DC2626]/[0.08] hover:text-[#DC2626]" aria-label="Excluir"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && setModal(false)}>
          <div className="bg-white rounded-[18px] w-full max-w-[720px] max-h-[90vh] overflow-y-auto scrollbar-thin p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-sans font-bold text-[17px] text-[#16212E]">{editando ? 'Editar imóvel' : 'Novo imóvel'}</h3>
              <button onClick={() => !loading && setModal(false)} className="text-[#9AA7B6] hover:text-[#16212E]" aria-label="Fechar"><X size={20} /></button>
            </div>

            <p className="font-mono text-[10px] tracking-[0.14em] text-[#C9A24B] mb-2">IDENTIFICAÇÃO</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <Campo label="CÓDIGO" value={form.codigo} onChange={str('codigo')} ph="Ex: AP-102" />
              <Campo label="TÍTULO" value={form.titulo} onChange={str('titulo')} ph="Ex: Apto 2 quartos no Centro" />
              <div>
                <label className={LBL}>TIPO</label>
                <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={INPUT}>
                  {TIPOS.map(t => <option key={t} value={t}>{cap(t)}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>FINALIDADE</label>
                <select value={form.finalidade} onChange={e => set('finalidade', e.target.value)} className={INPUT}>
                  {FINALIDADES.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>STATUS</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} className={INPUT}>
                  {STATUS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>PROPRIETÁRIO</label>
                <select value={form.proprietario_id} onChange={e => set('proprietario_id', e.target.value)} className={INPUT}>
                  <option value="">— nenhum —</option>
                  {proprietarios.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
            </div>

            <p className="font-mono text-[10px] tracking-[0.14em] text-[#C9A24B] mb-2">FOTOS</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {fotos.map(url => (
                <div key={url} className="relative w-[84px] h-[84px] rounded-[10px] overflow-hidden border border-[#16212E]/[0.1]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Foto do imóvel" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removerFoto(url)} className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5" aria-label="Remover foto">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <label className="w-[84px] h-[84px] rounded-[10px] border-2 border-dashed border-[#16212E]/[0.15] flex flex-col items-center justify-center gap-1 text-[#9AA7B6] cursor-pointer hover:border-[#C9A24B]/60 hover:text-[#C9A24B] transition-colors">
                {uploading
                  ? <Loader2 size={18} className="animate-spin" />
                  : <><ImagePlus size={18} /><span className="text-[9px]">Adicionar</span></>}
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => enviarFotos(e.target.files)} disabled={uploading} />
              </label>
            </div>

            <p className="font-mono text-[10px] tracking-[0.14em] text-[#C9A24B] mb-2">VALORES</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <Campo label="VALOR DE VENDA (R$)" value={form.valor_venda} onChange={str('valor_venda')} tipo="number" />
              <Campo label="VALOR DE LOCAÇÃO (R$)" value={form.valor_locacao} onChange={str('valor_locacao')} tipo="number" />
              <Campo label="CONDOMÍNIO (R$)" value={form.valor_condominio} onChange={str('valor_condominio')} tipo="number" />
              <Campo label="IPTU (R$)" value={form.valor_iptu} onChange={str('valor_iptu')} tipo="number" />
              <div>
                <label className={LBL}>PERIODICIDADE DO IPTU</label>
                <select value={form.iptu_periodicidade} onChange={e => set('iptu_periodicidade', e.target.value)} className={INPUT}>
                  <option value="anual">Anual</option>
                  <option value="mensal">Mensal</option>
                </select>
              </div>
            </div>

            <p className="font-mono text-[10px] tracking-[0.14em] text-[#C9A24B] mb-2">CARACTERÍSTICAS</p>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <Campo label="ÁREA ÚTIL (m²)" value={form.area_util} onChange={str('area_util')} tipo="number" />
              <Campo label="ÁREA TOTAL (m²)" value={form.area_total} onChange={str('area_total')} tipo="number" />
              <Campo label="QUARTOS" value={form.quartos} onChange={str('quartos')} tipo="number" />
              <Campo label="SUÍTES" value={form.suites} onChange={str('suites')} tipo="number" />
              <Campo label="BANHEIROS" value={form.banheiros} onChange={str('banheiros')} tipo="number" />
              <Campo label="VAGAS" value={form.vagas} onChange={str('vagas')} tipo="number" />
              <Campo label="MATRÍCULA" value={form.matricula} onChange={str('matricula')} />
              <Campo label="CHAVES" value={form.status_chaves} onChange={str('status_chaves')} ph="Ex: na imobiliária" />
            </div>

            <p className="font-mono text-[10px] tracking-[0.14em] text-[#C9A24B] mb-2">ENDEREÇO</p>
            <div className="grid grid-cols-3 gap-3 mb-2">
              <Campo label="CEP" value={form.cep} onChange={str('cep')} />
              <div className="col-span-2"><Campo label="LOGRADOURO" value={form.logradouro} onChange={str('logradouro')} /></div>
              <Campo label="NÚMERO" value={form.numero} onChange={str('numero')} />
              <Campo label="COMPLEMENTO" value={form.complemento} onChange={str('complemento')} />
              <Campo label="BAIRRO" value={form.bairro} onChange={str('bairro')} />
              <Campo label="CIDADE" value={form.cidade} onChange={str('cidade')} />
              <Campo label="UF" value={form.uf} onChange={str('uf')} />
            </div>
            <label className="flex items-center gap-2 text-[13px] text-[#56657A] mb-5">
              <input type="checkbox" checked={form.ocultar_numero_publico} onChange={e => set('ocultar_numero_publico', e.target.checked)} />
              Ocultar número no anúncio público
            </label>

            <p className="font-mono text-[10px] tracking-[0.14em] text-[#C9A24B] mb-2">OPÇÕES</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4 text-[13px] text-[#56657A]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.aceita_permuta} onChange={e => set('aceita_permuta', e.target.checked)} /> Aceita permuta</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.aceita_financiamento} onChange={e => set('aceita_financiamento', e.target.checked)} /> Aceita financiamento</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.publicar_portais} onChange={e => set('publicar_portais', e.target.checked)} /> Publicar nos portais</label>
            </div>
            <div className="mb-6">
              <label className={LBL}>DESCRIÇÃO</label>
              <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={3} className={INPUT} />
            </div>

            <div className="flex gap-2.5">
              <button onClick={() => setModal(false)} disabled={loading} className="flex-1 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-[#788698] border border-[#16212E]/[0.1] hover:bg-[#16212E]/[0.03] disabled:opacity-60">Cancelar</button>
              <button onClick={salvar} disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[11px] text-[13.5px] font-semibold text-white bg-[#16212E] hover:bg-[#22303f] disabled:opacity-60">
                {loading ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : 'Salvar imóvel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
