'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Building2, Palette, CreditCard, Users, Check, Loader2, Lock, Upload } from 'lucide-react'
import { planoTemAcesso } from '@/lib/acesso'

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
    wl_slogan: '',
    wl_whatsapp: '',
    wl_cor: '#D7282F',
    wl_logo_url: '',
  })

  useEffect(() => {
    if (empresa) {
      setForm({
        nome:          empresa.nome         ?? '',
        wl_slogan:     empresa.wl_slogan    ?? '',
        wl_whatsapp:   empresa.wl_whatsapp  ?? '',
        wl_cor:        empresa.wl_cor       ?? '#D7282F',
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
    const supabase = createClient()

    await supabase
      .from('empresas')
      .update({
        nome:        form.nome,
        // White-label fields only saved for plans that include the module
        ...(temWL ? {
          wl_slogan:   form.wl_slogan   || null,
          wl_whatsapp: form.wl_whatsapp || null,
          wl_cor:      form.wl_cor,
          wl_logo_url: form.wl_logo_url || null,
        } : {}),
      })
      .eq('id', empresa.id)

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

  const ABAS: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: 'loja',   label: 'Dados da loja',        icon: <Building2 size={15} /> },
    { id: 'visual', label: 'Visual / White-label',  icon: <Palette size={15} /> },
    { id: 'plano',  label: 'Plano',                 icon: <CreditCard size={15} /> },
    { id: 'equipe', label: 'Equipe',                icon: <Users size={15} /> },
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
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <div className="px-8 py-5 border-b border-[#16212E]/[0.08] shrink-0">
        <p className="text-xs font-mono tracking-[0.15em] text-[#788698] uppercase mb-0.5">SISTEMA</p>
        <h1 className="text-[22px] font-serif font-bold text-[#16212E]">Configurações da empresa</h1>
        {empresa && <p className="text-sm text-[#788698] mt-0.5">{empresa.nome}</p>}
      </div>

      {/* Abas — padrão Relatórios */}
      <div className="px-8 py-4 border-b border-[#16212E]/[0.08] shrink-0">
        <div className="flex gap-[4px] bg-white border border-[#16212E]/[0.08] rounded-[13px] p-[5px] w-max">
          {ABAS.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={[
                'flex items-center gap-2 px-[16px] py-[9px] rounded-[9px] text-[13.5px] font-semibold transition-all whitespace-nowrap',
                aba === a.id
                  ? 'bg-gradient-to-b from-[#E03037] to-[#C01F26] text-white shadow-[0_4px_14px_rgba(215,40,47,0.35)]'
                  : 'text-[#788698] hover:text-[#16212E] hover:bg-[#16212E]/[0.04]'
              ].join(' ')}
            >
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-xl space-y-5">

          {(aba === 'loja') && (
            <>
              <Campo label="Nome da loja" value={form.nome} onChange={v => setForm(f => ({ ...f, nome: v }))} />
              <Campo label="Slogan" value={form.wl_slogan} onChange={v => setForm(f => ({ ...f, wl_slogan: v }))} placeholder="Ex: Importados com qualidade" />
              <Campo label="WhatsApp (com DDI)" value={form.wl_whatsapp} onChange={v => setForm(f => ({ ...f, wl_whatsapp: v }))} placeholder="5511999999999" />
            </>
          )}

          {(aba === 'visual') && !planoTemAcesso(empresa?.plano, 'white_label') && (
            <div className="flex items-center gap-3 p-4 rounded-[12px] border border-[#E03037]/30 bg-[#E03037]/5">
              <Lock size={18} className="text-[#E03037] shrink-0" />
              <div>
                <p className="text-sm font-semibold text-[#16212E]">Recurso exclusivo do plano Pro</p>
                <p className="text-xs text-[#788698] mt-0.5">Faça upgrade para personalizar cores, logo e slogan da sua loja.</p>
              </div>
              <a href="/planos?upgrade=white_label" className="ml-auto text-xs font-semibold text-[#E03037] hover:underline whitespace-nowrap">Ver planos →</a>
            </div>
          )}

          {(aba === 'visual') && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#788698] mb-2">Cor primária</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.wl_cor}
                    onChange={e => setForm(f => ({ ...f, wl_cor: e.target.value }))}
                    className="w-12 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    value={form.wl_cor}
                    onChange={e => setForm(f => ({ ...f, wl_cor: e.target.value }))}
                    className="flex-1 bg-white border border-[#16212E]/[0.08] rounded-[10px] px-4 py-2.5 text-sm text-[#788698] outline-none font-mono"
                  />
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: form.wl_cor }}>A</div>
                </div>
                <p className="text-xs text-[#9FB0C2] mt-1.5">Aplicada em botões, destaques e ícones do sistema.</p>
              </div>
              <Campo label="URL do logo (PNG ou SVG)" value={form.wl_logo_url}
                onChange={v => setForm(f => ({ ...f, wl_logo_url: v }))}
                placeholder="https://suaempresa.com/logo.png" />
              {form.wl_logo_url && (
                <div className="p-4 bg-white border border-[#16212E]/[0.08] rounded-[12px]">
                  <p className="text-xs text-[#788698] mb-2">Preview do logo:</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.wl_logo_url} alt="Logo preview" className="h-10 object-contain" />
                </div>
              )}
            </>
          )}

          {(aba === 'plano') && (
            <div className="space-y-4">
              <div className="p-5 bg-white border border-[#16212E]/[0.08] rounded-[16px]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-[#788698]">Plano atual</p>
                    <p className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: planoAtual.cor }} />
                      {planoAtual.nome}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[#788698]">{planoAtual.preco}</p>
                </div>
                {emTrial && (
                  <div className="p-3 bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.2)] rounded-[10px]">
                    <p className="text-xs text-[#FBBF24]">✨ Trial gratuito — {diasTrial} dia{diasTrial !== 1 ? 's' : ''} restante{diasTrial !== 1 ? 's' : ''}</p>
                  </div>
                )}
                <div className="mt-4 space-y-3">
                  {[
                    { label: 'Leads', uso: usoAtual?.leads ?? 0, limite: planoAtual.leads, icon: '📋' },
                    { label: 'Usuários', uso: usoAtual?.usuarios ?? 0, limite: planoAtual.usuarios, icon: '👥' },
                  ].map(({ label, uso, limite, icon }) => {
                    const ilimitado = limite >= 99999
                    const pct = ilimitado ? 0 : Math.min(100, (uso / limite) * 100)
                    const cor = pct >= 100 ? '#D7282F' : pct >= 80 ? '#FBBF24' : '#15986A'
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[#788698]">{icon} {label}</span>
                          <span className="text-xs font-semibold text-[#56657A]">
                            {usoAtual ? `${uso} / ${ilimitado ? '∞' : limite}` : '…'}
                          </span>
                        </div>
                        {!ilimitado && (
                          <div className="h-1.5 bg-[#16212E]/[0.06] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: cor }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              {empresa?.plano !== 'pro' && (
                <div className="p-5 bg-[rgba(215,40,47,0.05)] border border-[rgba(215,40,47,0.15)] rounded-[16px]">
                  <p className="text-sm font-semibold text-white mb-1">Fazer upgrade</p>
                  <p className="text-xs text-[#788698] mb-4">Desbloqueie mais usuários, leads ilimitados e white-label completo.</p>
                  <a href="https://wa.me/5519999999999?text=Quero+fazer+upgrade+do+meu+plano"
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#D7282F] text-white text-sm font-semibold px-4 py-2 rounded-[10px] hover:bg-[#B91C1C] transition-colors">
                    Falar com suporte
                  </a>
                </div>
              )}
            </div>
          )}

          {(aba === 'equipe') && (
            <div className="space-y-3">
              {membros.length === 0 ? (
                <p className="text-sm text-[#788698]">Nenhum membro encontrado.</p>
              ) : membros.map(m => (
                <div key={m.usuario_id} className="flex items-center justify-between p-4 bg-white border border-[#16212E]/[0.08] rounded-[12px]">
                  <div>
                    <p className="text-sm font-semibold text-[#16212E]">{getNomeUsuario(m)}</p>
                    <p className="text-xs text-[#788698]">{getEmailUsuario(m)}</p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#16212E]/[0.04] text-[#788698] capitalize">{m.role}</span>
                </div>
              ))}
              <p className="text-xs text-[#9FB0C2] pt-2">
                {membros.length}/{planoAtual.usuarios === 999 ? '∞' : planoAtual.usuarios} usuários no plano {planoAtual.nome}.
                {empresa?.plano !== 'pro' && ' Faça upgrade para adicionar mais.'}
              </p>
            </div>
          )}

          {(aba === 'loja' || aba === 'visual') && (
            <button onClick={salvar} disabled={loading}
              className="flex items-center gap-2 bg-[#D7282F] hover:bg-[#B91C1C] disabled:opacity-50 text-white font-semibold rounded-[10px] px-6 py-2.5 text-sm transition-colors">
              {loading ? <Loader2 size={15} className="animate-spin" /> : sucesso ? <Check size={15} /> : <Upload size={15} />}
              {sucesso ? 'Salvo!' : 'Salvar alterações'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Campo({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#788698] mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white border border-[#16212E]/[0.08] rounded-[10px] px-4 py-2.5 text-sm text-[#788698] placeholder:text-[#9FB0C2] outline-none focus:border-[#16212E]/[0.08] transition-colors" />
    </div>
  )
}
