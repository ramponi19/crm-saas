'use client'
import { useState, useEffect } from 'react'
import { QrCode, Send, Copy, Check, Link as LinkIcon, PackageCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import type { TablesInsert, TablesUpdate } from '@/types/database'
import { useRouter } from 'next/navigation'
import { Modal, Input, Select, Textarea, Button, Badge, notify } from '@/components/ui'

interface Cobranca {
  id: number
  qr_code: string | null
  qr_code_base64: string | null
  linha_digitavel: string | null
  link_pagamento: string | null
  status: string
}

interface OS {
  id?: number
  protocolo: string | null
  tipo: string | null
  status: string | null
  defeito_relatado: string | null
  parecer_tecnico: string | null
  orcamento_valor: number | null
  imei_serial: string | null
  dentro_garantia: boolean | null
  dias_garantia_restantes: number | null
  data_entrada: string | null
  created_at?: string | null
  observacoes: string | null
  estado_entrada: string | null
  celular_reserva_fornecido: boolean | null
  modelo_reserva: string | null
  cliente_id: number | null
  produto_id: number | null
  token?: string | null
  aprovado_em?: string | null
  recusado_em?: string | null
  clientes?: { nome: string; telefone: string | null } | null
  produtos?: { nome: string } | null
}
interface Props { os: OS | null; isNew: boolean; onClose: () => void }

const EMPTY: OS = {
  protocolo: null, tipo: 'assistencia', status: 'em_analise',
  defeito_relatado: null, parecer_tecnico: null, orcamento_valor: null,
  imei_serial: null, dentro_garantia: false, dias_garantia_restantes: null,
  data_entrada: new Date().toISOString().split('T')[0], observacoes: null,
  estado_entrada: null, celular_reserva_fornecido: false, modelo_reserva: null,
  cliente_id: null, produto_id: null,
}

type Tone = 'neutro' | 'acc' | 'ok' | 'warn' | 'bad'

const STATUS_OPTIONS: { value: string; label: string; tone: Tone }[] = [
  { value: 'em_analise', label: 'Em análise', tone: 'acc' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação', tone: 'warn' },
  { value: 'aprovado', label: 'Aprovado', tone: 'ok' },
  { value: 'em_reparo', label: 'Em reparo', tone: 'warn' },
  { value: 'aguardando_peca', label: 'Aguardando peça', tone: 'warn' },
  { value: 'pronto', label: 'Pronto p/ retirada', tone: 'ok' },
  { value: 'concluido', label: 'Concluído', tone: 'ok' },
  { value: 'entregue', label: 'Entregue', tone: 'neutro' },
  { value: 'reprovado', label: 'Reprovado', tone: 'bad' },
]

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-raised p-3 text-center">
      <div className="num truncate text-[15px] font-bold leading-tight text-ink">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-ink-3">{label}</div>
    </div>
  )
}

const supabase = createClient()

export default function OSModal({ os, isNew, onClose }: Props) {
  const router = useRouter()
  const { empresa } = useEmpresa()
  const empresaId = empresa?.id
  const [form, setForm] = useState<OS>(isNew ? EMPTY : { ...EMPTY, ...os })
  const [saving, setSaving] = useState(false)
  const [clientes, setClientes] = useState<{ id: number; nome: string }[]>([])
  const [produtos, setProdutos] = useState<{ id: number; nome: string }[]>([])
  const [cobrando, setCobrando] = useState(false)
  const [cobranca, setCobranca] = useState<Cobranca | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [enviandoWpp, setEnviandoWpp] = useState(false)
  const [origin, setOrigin] = useState('')
  const [linkCopiado, setLinkCopiado] = useState(false)
  const [marcandoPronto, setMarcandoPronto] = useState(false)
  useEffect(() => { if (typeof window !== 'undefined') setOrigin(window.location.origin) }, [])
  const aprovacaoUrl = form.token && origin ? `${origin}/os/${form.token}` : ''

  async function copiarLink() {
    if (!aprovacaoUrl) return
    await navigator.clipboard.writeText(aprovacaoUrl)
    setLinkCopiado(true); setTimeout(() => setLinkCopiado(false), 2000)
  }
  function compartilharLink() {
    if (!aprovacaoUrl) return
    const msg = encodeURIComponent(`Olá${os?.clientes?.nome ? ' ' + os.clientes.nome : ''}! Segue o orçamento da OS ${form.protocolo ?? `#${os?.id}`} para sua aprovação: ${aprovacaoUrl}`)
    const digits = (os?.clientes?.telefone ?? '').replace(/\D/g, '')
    const alvo = digits ? (digits.length <= 11 ? '55' + digits : digits) : ''
    window.open(alvo ? `https://wa.me/${alvo}?text=${msg}` : `https://wa.me/?text=${msg}`, '_blank')
  }
  async function marcarPronto() {
    if (!os?.id) return
    setMarcandoPronto(true)
    const { error } = await supabase.from('garantias_assistencias').update({ status: 'pronto' }).eq('id', os.id)
    if (!error && empresaId) {
      // Aviso "pronto para retirada" = TAREFA interna (Meta-safe: não envia mensagem).
      await supabase.from('tarefas').insert({
        empresa_id: empresaId, tipo: 'ligacao', vencimento: new Date().toISOString(),
        titulo: `Avisar cliente: OS ${form.protocolo ?? `#${os.id}`} pronta para retirada${os.clientes?.nome ? ` (${os.clientes.nome})` : ''}`,
      } as TablesInsert<'tarefas'>)
    }
    setMarcandoPronto(false)
    if (error) { notify.bad('Erro ao marcar'); return }
    notify.ok('OS pronta — tarefa de aviso criada'); setForm(f => ({ ...f, status: 'pronto' })); router.refresh()
  }

  useEffect(() => {
    if (!empresaId) return
    supabase.from('clientes').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome').then(({ data }) => setClientes(data ?? []))
    supabase.from('produtos').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome').then(({ data }) => setProdutos(data ?? []))
  }, [empresaId])

  function set(field: keyof OS, value: string | boolean | number | null) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function cobrar() {
    if (!os?.id || !form.orcamento_valor) return
    setCobrando(true)
    try {
      const res = await fetch('/api/payments/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'pix',
          valor: form.orcamento_valor,
          osId: os.id,
          descricao: `OS ${form.protocolo ?? `#${os.id}`}`,
          pagador: os.clientes ? { nome: os.clientes.nome, telefone: os.clientes.telefone ?? undefined } : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao gerar cobrança')
      setCobranca(json.cobranca)
      notify.ok('Cobrança gerada!')
    } catch (err) {
      notify.bad(err instanceof Error ? err.message : 'Erro ao gerar cobrança')
    } finally {
      setCobrando(false)
    }
  }

  async function copiarPix() {
    const texto = cobranca?.linha_digitavel ?? cobranca?.qr_code ?? ''
    if (!texto) return
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function enviarWhatsApp() {
    if (!os?.clientes?.telefone || !cobranca) return
    setEnviandoWpp(true)
    const chave = cobranca.linha_digitavel ?? cobranca.qr_code ?? cobranca.link_pagamento ?? ''
    const msg = `Olá ${os.clientes.nome}! Segue o Pix para pagamento da OS *${form.protocolo ?? `#${os.id}`}* no valor de *R$ ${Number(form.orcamento_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*:\n\n${chave}`
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: os.clientes.telefone, message: msg }),
      })
      if (!res.ok) throw new Error('Falha ao enviar')
      notify.ok('WhatsApp enviado!')
    } catch {
      notify.bad('Erro ao enviar WhatsApp')
    } finally {
      setEnviandoWpp(false)
    }
  }

  async function salvar() {
    setSaving(true)
    const { clientes: _c, produtos: _p, ...payload } = form
    const base = { ...payload, tipo: 'assistencia' as const, empresa_id: empresaId, protocolo: payload.protocolo || `OS-${Date.now().toString().slice(-6)}` }
    if (isNew) {
      const { error } = await supabase.from('garantias_assistencias').insert(base as TablesInsert<'garantias_assistencias'>)
      if (error) { notify.bad('Erro ao criar OS'); setSaving(false); return }
      notify.ok('OS criada!')
    } else {
      const { error } = await supabase.from('garantias_assistencias').update(base as TablesUpdate<'garantias_assistencias'>).eq('id', os!.id!)
      if (error) { notify.bad('Erro ao salvar'); setSaving(false); return }
      notify.ok('Salvo!')
    }
    router.refresh(); onClose()
  }

  const statusOpt = STATUS_OPTIONS.find(s => s.value === form.status)

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      disableOverlayClose={saving}
      title={
        <span className="flex items-center gap-2.5">
          <span className="truncate">{isNew ? 'Nova OS' : (form.protocolo ?? `OS #${os?.id}`)}</span>
          {!isNew && statusOpt && <Badge tone={statusOpt.tone}>{statusOpt.label}</Badge>}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Fechar</Button>
          <Button onClick={salvar} loading={saving}>Salvar</Button>
        </>
      }
    >
      {!isNew && os?.clientes?.nome && (
        <p className="-mt-1 mb-3 text-[12px] text-ink-2">{os.clientes.nome}</p>
      )}

      {!isNew && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Entrada" value={new Date(os?.data_entrada ?? os?.created_at ?? '').toLocaleDateString('pt-BR')} />
          <Stat label="Orçamento" value={os?.orcamento_valor ? `R$ ${Number(os.orcamento_valor).toLocaleString('pt-BR')}` : '—'} />
          <Stat label="Aparelho" value={os?.produtos?.nome ?? '—'} />
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); salvar() }} className="grid grid-cols-2 gap-3">
        <Input label="Nº OS" value={form.protocolo ?? ''} onChange={e => set('protocolo', e.target.value)} placeholder="OS-000001" />
        <Select label="Status" value={form.status ?? 'em_analise'} onChange={e => set('status', e.target.value)}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select label="Cliente" value={form.cliente_id ?? ''} onChange={e => set('cliente_id', e.target.value ? Number(e.target.value) : null)}>
          <option value="">Selecionar...</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <Select label="Produto" value={form.produto_id ?? ''} onChange={e => set('produto_id', e.target.value ? Number(e.target.value) : null)}>
          <option value="">Selecionar...</option>
          {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </Select>
        <Input label="IMEI / Nº série" value={form.imei_serial ?? ''} onChange={e => set('imei_serial', e.target.value)} placeholder="358000000000000" />
        <Input label="Data de entrada" type="date" value={form.data_entrada ?? ''} onChange={e => set('data_entrada', e.target.value)} />
        <Select label="Origem" value={form.dentro_garantia ? 'garantia' : 'externo'} onChange={e => set('dentro_garantia', e.target.value === 'garantia')}>
          <option value="externo">Reparo externo</option>
          <option value="garantia">Garantia</option>
        </Select>
        <Input label="Orçamento (R$)" type="number" value={form.orcamento_valor ?? ''} onChange={e => set('orcamento_valor', e.target.value ? Number(e.target.value) : null)} placeholder="0,00" />
        <Input wrapperClassName="col-span-2" label="Estado de entrada" value={form.estado_entrada ?? ''} onChange={e => set('estado_entrada', e.target.value)} placeholder="Ex: Tela trincada..." />
        <Textarea wrapperClassName="col-span-2" label="Defeito relatado" rows={2} value={form.defeito_relatado ?? ''} onChange={e => set('defeito_relatado', e.target.value)} placeholder="Descreva o problema..." />
        <Textarea wrapperClassName="col-span-2" label="Parecer técnico" rows={2} value={form.parecer_tecnico ?? ''} onChange={e => set('parecer_tecnico', e.target.value)} placeholder="Diagnóstico..." />
        <Textarea wrapperClassName="col-span-2" label="Observações" rows={2} value={form.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} placeholder="..." />
      </form>

      {/* Aprovação do orçamento por link público (Meta-safe: link, não envio automático) */}
      {!isNew && !!form.orcamento_valor && (
        <div className="mt-4 space-y-2.5 border-t border-line-soft pt-4">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <LinkIcon size={14} strokeWidth={1.7} /> Aprovação do orçamento
            {form.aprovado_em && <Badge tone="ok">Aprovado pelo cliente</Badge>}
            {form.recusado_em && <Badge tone="bad">Recusado pelo cliente</Badge>}
          </div>
          {!form.aprovado_em && !form.recusado_em && (
            <p className="text-[11.5px] text-ink-3">Envie o link pro cliente aprovar. A resposta atualiza o status da OS aqui automaticamente.</p>
          )}
          {aprovacaoUrl && (
            <>
              <div className="flex items-center gap-2">
                <Input wrapperClassName="flex-1" readOnly value={aprovacaoUrl} className="num truncate text-ink-2" />
                <Button type="button" variant="outline" onClick={copiarLink} icon={linkCopiado ? <Check size={13} strokeWidth={1.7} className="text-ok" /> : <Copy size={13} strokeWidth={1.7} />}>
                  {linkCopiado ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
              <Button type="button" variant="outline" className="w-full" icon={<Send size={13} strokeWidth={1.7} />} onClick={compartilharLink}>
                Enviar link no WhatsApp
              </Button>
            </>
          )}
          {form.status !== 'pronto' && form.status !== 'entregue' && (
            <Button type="button" variant="outline" className="w-full text-ok" icon={<PackageCheck size={14} strokeWidth={1.7} />} onClick={marcarPronto} loading={marcandoPronto}>
              Marcar pronto para retirada
            </Button>
          )}
        </div>
      )}

      {/* Cobrança Pix */}
      {!isNew && !!form.orcamento_valor && form.status !== 'reprovado' && (
        <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
          {!cobranca ? (
            <Button type="button" variant="outline" className="w-full text-ok" icon={<QrCode size={15} strokeWidth={1.7} />} onClick={cobrar} loading={cobrando}>
              {cobrando ? 'Gerando cobrança...' : `Cobrar R$ ${Number(form.orcamento_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </Button>
          ) : (
            <div className="rounded-card border border-ok/20 bg-ok-soft p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-ok">Pix gerado</p>
                <Badge tone="ok">{cobranca.status}</Badge>
              </div>
              {cobranca.qr_code_base64 && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:image/png;base64,${cobranca.qr_code_base64}`} alt="QR Code Pix" className="h-36 w-36 rounded-control" />
                </div>
              )}
              {(cobranca.linha_digitavel ?? cobranca.qr_code) && (
                <div className="flex items-center gap-2">
                  <Input wrapperClassName="flex-1" readOnly value={cobranca.linha_digitavel ?? cobranca.qr_code ?? ''} className="num truncate text-ink-2" />
                  <Button type="button" variant="outline" onClick={copiarPix} icon={copiado ? <Check size={13} strokeWidth={1.7} className="text-ok" /> : <Copy size={13} strokeWidth={1.7} />}>
                    {copiado ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              )}
              {os?.clientes?.telefone && (
                <Button type="button" variant="outline" className="w-full text-ok" icon={<Send size={13} strokeWidth={1.7} />} onClick={enviarWhatsApp} loading={enviandoWpp}>
                  {enviandoWpp ? 'Enviando...' : 'Enviar via WhatsApp'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
