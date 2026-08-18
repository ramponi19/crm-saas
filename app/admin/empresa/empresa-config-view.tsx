'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Building2, Palette, CreditCard, Users, Check, Lock, Upload } from 'lucide-react'
import { planoTemAcesso } from '@/lib/plano'
import { Topbar } from '@/components/layout/topbar'
import { Button, Input, Card, Badge, Tabs, notify, type TabItem } from '@/components/ui'

type Aba = 'loja' | 'visual' | 'plano' | 'equipe'

interface PlanoConfig {
  id: string
  nome: string
  preco_centavos: number
  cor: string
  limite_usuarios: number
  limite_leads: number
}

interface MembroEquipe {
  usuario_id: string
  role: string
  ativo: boolean
  usuarios: { nome: string; email: string; role: string } | { nome: string; email: string; role: string }[] | null
}

export default function EmpresaConfigPage() {
  const { empresa, refetch } = useEmpresa()
  const [aba, setAba] = useState<Aba>('loja')
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [membros, setMembros] = useState<MembroEquipe[]>([])
  const [planosConfig, setPlanosConfig] = useState<PlanoConfig[]>([])
  const [usoAtual, setUsoAtual] = useState<{ leads: number; usuarios: number } | null>(null)

  const [form, setForm] = useState({
    nome: '',
    // Dados JURÍDICOS da loja. Não eram editáveis em lugar nenhum: só entravam no
    // cadastro inicial e, se a pessoa pulasse, ficavam vazios para sempre — e o
    // contrato de compra e venda sai sem identificar a vendedora.
    cnpj: '',
    telefone: '',
    email: '',
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    representante_nome: '',
    representante_cpf: '',
    wl_slogan: '',
    wl_whatsapp: '',
    wl_cor: '#2E5CE6',
    wl_logo_url: '',
  })

  useEffect(() => {
    if (empresa) {
      setForm({
        nome:          empresa.nome         ?? '',
        cnpj:          empresa.cnpj         ?? '',
        telefone:      empresa.telefone     ?? '',
        email:              empresa.email              ?? '',
        cep:                empresa.cep                ?? '',
        endereco:           empresa.endereco           ?? '',
        numero:             empresa.numero             ?? '',
        complemento:        empresa.complemento        ?? '',
        bairro:             empresa.bairro             ?? '',
        cidade:             empresa.cidade             ?? '',
        estado:             empresa.estado             ?? '',
        representante_nome: empresa.representante_nome ?? '',
        representante_cpf:  empresa.representante_cpf  ?? '',
        wl_slogan:     empresa.wl_slogan    ?? '',
        wl_whatsapp:   empresa.wl_whatsapp  ?? '',
        wl_cor:        empresa.wl_cor       ?? '#2E5CE6',
        wl_logo_url:   empresa.wl_logo_url  ?? '',
      })
    }
  }, [empresa])

  useEffect(() => {
    if (aba === 'equipe') carregarEquipe()
    if (aba === 'plano' && planosConfig.length === 0) carregarPlanos()
    if (aba === 'plano') carregarUso()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba])

  async function carregarEquipe() {
    const supabase = createClient()
    const { data } = await supabase
      .from('empresa_usuarios')
      .select('usuario_id, role, ativo, usuarios!empresa_usuarios_usuario_public_fkey(nome, email, role)')
      .eq('ativo', true)
    if (data) setMembros(data as unknown as MembroEquipe[])
  }

  async function carregarUso() {
    if (!empresa) return
    const supabase = createClient()
    const [{ count: leads }, { count: usuarios }] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('empresa_id', empresa.id).eq('ativo', true),
      supabase.from('empresa_usuarios').select('*', { count: 'exact', head: true }).eq('empresa_id', empresa.id).eq('ativo', true),
    ])
    setUsoAtual({ leads: leads ?? 0, usuarios: usuarios ?? 0 })
  }

  async function carregarPlanos() {
    const supabase = createClient()
    const { data } = await supabase
      .from('planos_config')
      .select('id, nome, preco_centavos, cor, limite_usuarios, limite_leads')
      .eq('ativo', true)
      .order('ordem')
    if (data) setPlanosConfig(data as PlanoConfig[])
  }

  async function salvar() {
    if (!empresa) return
    const temWL = planoTemAcesso(empresa.plano, 'white_label')
    setLoading(true)
    setSucesso(false)

    /**
     * Salva pelo SERVIDOR, não direto pelo cliente.
     *
     * `empresas` tem grant de UPDATE por coluna para `authenticated` — só nome e
     * white-label. Gravando daqui, CNPJ e telefone davam "permission denied for
     * column": a tela existia e não funcionava, e foi por isso que a JM ficou com os
     * dois vazios e o contrato saiu sem identificar a vendedora. Ver
     * app/api/empresa/route.ts, que confere owner/admin antes de gravar.
     */
    const resposta = await fetch('/api/empresa', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome:        form.nome,
        // Fora do bloco de white-label de propósito: identificação da empresa não é
        // recurso de plano pago — é o que faz o contrato ser válido.
        cnpj:        form.cnpj.trim()     || null,
        telefone:    form.telefone.trim() || null,
        email:              form.email.trim()              || null,
        cep:                form.cep.trim()                || null,
        endereco:           form.endereco.trim()           || null,
        numero:             form.numero.trim()             || null,
        complemento:        form.complemento.trim()        || null,
        bairro:             form.bairro.trim()             || null,
        cidade:             form.cidade.trim()             || null,
        // UF em maiúsculas: o contrato escreve "Campinas - SP", não "- sp".
        estado:             form.estado.trim().toUpperCase() || null,
        representante_nome: form.representante_nome.trim()  || null,
        representante_cpf:  form.representante_cpf.trim()   || null,
        // White-label fields only saved for plans that include the module
        ...(temWL ? {
          wl_slogan:   form.wl_slogan   || null,
          wl_whatsapp: form.wl_whatsapp || null,
          wl_cor:      form.wl_cor,
          wl_logo_url: form.wl_logo_url || null,
        } : {}),
      }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok) { setLoading(false); notify.bad('Erro ao salvar', corpo?.error); return }

    document.documentElement.style.setProperty('--color-primary', form.wl_cor)

    await refetch()
    setLoading(false)
    setSucesso(true)
    setTimeout(() => setSucesso(false), 3000)
  }

  function getNomeUsuario(m: MembroEquipe): string {
    if (!m.usuarios) return '—'
    if (Array.isArray(m.usuarios)) return m.usuarios[0]?.nome ?? '—'
    return m.usuarios.nome
  }

  function getEmailUsuario(m: MembroEquipe): string {
    if (!m.usuarios) return ''
    if (Array.isArray(m.usuarios)) return m.usuarios[0]?.email ?? ''
    return m.usuarios.email
  }

  const ABAS: TabItem[] = [
    { value: 'loja',   label: <span className="flex items-center gap-2"><Building2 size={15} strokeWidth={1.7} /> Dados da loja</span> },
    { value: 'visual', label: <span className="flex items-center gap-2"><Palette size={15} strokeWidth={1.7} /> Visual / White-label</span> },
    { value: 'plano',  label: <span className="flex items-center gap-2"><CreditCard size={15} strokeWidth={1.7} /> Plano</span> },
    { value: 'equipe', label: <span className="flex items-center gap-2"><Users size={15} strokeWidth={1.7} /> Equipe</span> },
  ]

  function fmtPreco(centavos: number) {
    if (centavos === 0) return 'Grátis'
    return `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}/mês`
  }

  const planoAtualConfig = planosConfig.find(p => p.id === empresa?.plano)
  const planoAtual = planoAtualConfig
    ? { nome: planoAtualConfig.nome, preco: fmtPreco(planoAtualConfig.preco_centavos), cor: planoAtualConfig.cor, usuarios: planoAtualConfig.limite_usuarios, leads: planoAtualConfig.limite_leads }
    : { nome: empresa?.plano ?? 'Free', preco: '–', cor: '#5C6E84', usuarios: 1, leads: 100 }
  const diasTrial  = empresa?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(empresa.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0
  const emTrial    = diasTrial > 0

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Minha empresa" />

      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-xl space-y-4">

          <Tabs items={ABAS} value={aba} onValueChange={(v) => setAba(v as Aba)} />

          {(aba === 'loja') && (
            <Card title="Dados da loja">
              <div className="space-y-3">
                <Input label="Nome da loja" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                {/* CNPJ e telefone saem no CONTRATO ({{loja.cnpj}}) e na nota. Não
                    havia onde preencher: só o cadastro inicial pedia, e a JM está em
                    produção com os dois vazios — o contrato de compra e venda não
                    identifica a vendedora. */}
                <Input
                  label="CNPJ"
                  value={form.cnpj}
                  onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                  hint="Sai no contrato de compra e venda. Sem ele, o documento não identifica a loja."
                  className="num"
                />
                <Input
                  label="Telefone da loja"
                  value={form.telefone}
                  onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                  placeholder="(19) 3333-4444"
                  hint="Contato que aparece nos documentos."
                  className="num"
                />
                {/* Endereço e representante: o bloco "VENDEDORA" do contrato pede
                    razão social, CNPJ, e-mail, endereço completo e quem assina. Sem
                    estes campos o modelo só conseguia trazer tudo como texto fixo —
                    era o que fazia o contrato da JM sair como "SUA EMPRESA LTDA". */}
                <Input label="E-mail da loja" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contato@sualoja.com.br" hint="Sai no contrato ({{loja.email}})." />
                <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
                  <Input label="Endereço (rua/avenida)" value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Avenida Central" />
                  <Input label="Número" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder="250" className="num" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Complemento" value={form.complemento} onChange={e => setForm(f => ({ ...f, complemento: e.target.value }))} placeholder="Loja 3" />
                  <Input label="Bairro" value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} placeholder="Centro" />
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_90px_150px]">
                  <Input label="Cidade" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} placeholder="Campinas" />
                  <Input label="UF" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} placeholder="SP" maxLength={2} />
                  <Input label="CEP" value={form.cep} onChange={e => setForm(f => ({ ...f, cep: e.target.value }))} placeholder="13000-000" className="num" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Quem assina pela loja" value={form.representante_nome} onChange={e => setForm(f => ({ ...f, representante_nome: e.target.value }))} placeholder="Nome do responsável legal" hint="Aparece no contrato como representante." />
                  <Input label="CPF de quem assina" value={form.representante_cpf} onChange={e => setForm(f => ({ ...f, representante_cpf: e.target.value }))} placeholder="000.000.000-00" className="num" />
                </div>
                <Input label="Slogan" value={form.wl_slogan} onChange={e => setForm(f => ({ ...f, wl_slogan: e.target.value }))} placeholder="Ex: Importados com qualidade" />
                <Input label="WhatsApp (com DDI)" value={form.wl_whatsapp} onChange={e => setForm(f => ({ ...f, wl_whatsapp: e.target.value }))} placeholder="5511999999999" />
              </div>
            </Card>
          )}

          {(aba === 'visual') && !planoTemAcesso(empresa?.plano, 'white_label') && (
            <div className="flex items-center gap-3 rounded-card border border-accent/20 bg-accent-soft p-4">
              <Lock size={18} strokeWidth={1.7} className="shrink-0 text-accent" />
              <div>
                <p className="text-[13px] font-semibold text-ink">Recurso exclusivo do plano Pro</p>
                <p className="mt-0.5 text-[12px] text-ink-2">Faça upgrade para personalizar cores, logo e slogan da sua loja.</p>
              </div>
              <a href="/admin/planos?upgrade=white_label" className="ml-auto whitespace-nowrap text-[12px] font-semibold text-accent hover:underline">Ver planos →</a>
            </div>
          )}

          {(aba === 'visual') && (
            <>
              <Card title="Cor da marca">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.wl_cor}
                    onChange={e => setForm(f => ({ ...f, wl_cor: e.target.value }))}
                    className="h-9 w-12 cursor-pointer rounded-control border border-line bg-card"
                  />
                  <input
                    value={form.wl_cor}
                    onChange={e => setForm(f => ({ ...f, wl_cor: e.target.value }))}
                    className="h-9 flex-1 rounded-control border border-line bg-card px-3 text-[13px] text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/40"
                  />
                  <div className="grid h-9 w-9 place-items-center rounded-control text-[11px] font-bold text-white"
                    style={{ background: form.wl_cor }}>A</div>
                </div>
                <p className="mt-2 text-[12px] text-ink-3">Aplicada em botões, destaques e ícones do sistema.</p>
              </Card>
              <Card title="Logo">
                <Input label="URL do logo (PNG ou SVG)" value={form.wl_logo_url}
                  onChange={e => setForm(f => ({ ...f, wl_logo_url: e.target.value }))}
                  placeholder="https://suaempresa.com/logo.png" />
                {form.wl_logo_url && (
                  <div className="mt-3 rounded-control border border-line bg-raised p-4">
                    <p className="mb-2 text-[12px] text-ink-2">Preview do logo:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.wl_logo_url} alt="Logo preview" className="h-10 object-contain" />
                  </div>
                )}
              </Card>
            </>
          )}

          {(aba === 'plano') && (
            <div className="space-y-4">
              <Card title="Plano atual">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-[17px] font-bold text-ink">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: planoAtual.cor }} />
                    {planoAtual.nome}
                  </p>
                  <p className="text-[13px] font-semibold text-ink-2">{planoAtual.preco}</p>
                </div>
                {emTrial && (
                  <div className="mt-3 rounded-control border border-warn/20 bg-warn-soft px-3 py-2">
                    <p className="text-[12px] font-medium text-warn">Trial gratuito — {diasTrial} dia{diasTrial !== 1 ? 's' : ''} restante{diasTrial !== 1 ? 's' : ''}</p>
                  </div>
                )}
                <div className="mt-4 space-y-3">
                  {[
                    { label: 'Leads', uso: usoAtual?.leads ?? 0, limite: planoAtual.leads },
                    { label: 'Usuários', uso: usoAtual?.usuarios ?? 0, limite: planoAtual.usuarios },
                  ].map(({ label, uso, limite }) => {
                    const ilimitado = limite >= 99999
                    const pct = ilimitado ? 0 : Math.min(100, (uso / limite) * 100)
                    const barra = pct >= 100 ? 'bg-bad' : pct >= 80 ? 'bg-warn' : 'bg-ok'
                    return (
                      <div key={label}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[12px] text-ink-2">{label}</span>
                          <span className="num text-[12px] font-semibold text-ink-2">
                            {usoAtual ? `${uso} / ${ilimitado ? '∞' : limite}` : '…'}
                          </span>
                        </div>
                        {!ilimitado && (
                          <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                            <div className={`h-full rounded-full transition-all duration-500 ${barra}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Card>
              {empresa?.plano !== 'pro' && (
                <Card title="Fazer upgrade">
                  <p className="text-[13px] text-ink-2">Desbloqueie mais usuários, leads ilimitados e white-label completo.</p>
                  <a href="https://wa.me/5519999999999?text=Quero+fazer+upgrade+do+meu+plano"
                    target="_blank" rel="noopener noreferrer"
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-control bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-ink/90">
                    Falar com suporte
                  </a>
                </Card>
              )}
            </div>
          )}

          {(aba === 'equipe') && (
            <div className="space-y-3">
              {membros.length === 0 ? (
                <p className="text-[13px] text-ink-2">Nenhum membro encontrado.</p>
              ) : membros.map(m => (
                <div key={m.usuario_id} className="flex items-center justify-between rounded-card border border-line bg-card px-4 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{getNomeUsuario(m)}</p>
                    <p className="text-[12px] text-ink-2">{getEmailUsuario(m)}</p>
                  </div>
                  <Badge tone="neutro" className="capitalize">{m.role}</Badge>
                </div>
              ))}
              <p className="pt-2 text-[12px] text-ink-3">
                {membros.length}/{planoAtual.usuarios === 999 ? '∞' : planoAtual.usuarios} usuários no plano {planoAtual.nome}.
                {empresa?.plano !== 'pro' && ' Faça upgrade para adicionar mais.'}
              </p>
            </div>
          )}

          {(aba === 'loja' || aba === 'visual') && (
            <Button onClick={salvar} loading={loading}
              icon={sucesso ? <Check size={15} strokeWidth={1.7} /> : <Upload size={15} strokeWidth={1.7} />}>
              {sucesso ? 'Salvo!' : 'Salvar alterações'}
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}
