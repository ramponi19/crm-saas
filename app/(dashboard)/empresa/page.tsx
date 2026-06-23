'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/lib/empresa-context'
import { Building2, Palette, CreditCard, Users, Check, Loader2, Upload } from 'lucide-react'

type Aba = 'loja' | 'visual' | 'plano' | 'equipe'

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba])

  async function carregarEquipe() {
    const supabase = createClient()
    const { data } = await supabase
      .from('empresa_usuarios')
      .select('usuario_id, role, ativo, usuarios(nome, email, role)')
    if (data) setMembros(data as unknown as MembroEquipe[])
  }

  async function salvar() {
    if (!empresa) return
    setLoading(true)
    setSucesso(false)
    const supabase = createClient()

    await supabase
      .from('empresas')
      .update({
        nome:         form.nome,
        wl_slogan:    form.wl_slogan   || null,
        wl_whatsapp:  form.wl_whatsapp || null,
        wl_cor:       form.wl_cor,
        wl_logo_url:  form.wl_logo_url || null,
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

  const PLANOS = [
    { id: 'free',    nome: 'Free',    preco: 'Grátis',      cor: '#5C6E84', usuarios: 1,   leads: 100   },
    { id: 'starter', nome: 'Starter', preco: 'R$ 197/mês',  cor: '#6B8CFF', usuarios: 3,   leads: 500   },
    { id: 'pro',     nome: 'Pro',     preco: 'R$ 397/mês',  cor: '#D7282F', usuarios: 999, leads: 99999 },
  ]

  const planoAtual = PLANOS.find(p => p.id === empresa?.plano) ?? PLANOS[0]
  const emTrial = empresa?.trial_ends_at && new Date(empresa.trial_ends_at) > new Date()
  const diasTrial = empresa?.trial_ends_at
    ? Math.ceil((new Date(empresa.trial_ends_at).getTime() - Date.now()) / 86400000)
    : 0

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-8 pt-8 pb-0 shrink-0">
        <h1 className="text-xl font-semibold text-[#1F2A39]">Configurações da empresa</h1>
        <p className="text-sm text-[#788698] mt-0.5">{empresa?.nome}</p>

        <div className="flex gap-1 mt-6 border-b border-[#16212E]/[0.08]">
          {ABAS.map(a => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                aba === a.id
                  ? 'border-[#D7282F] text-white'
                  : 'border-transparent text-[#788698] hover:text-[#788698]'
              }`}
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
                    className="flex-1 bg-white border border-[#16212E]/[0.08] rounded-[10px] px-4 py-2.5 text-sm text-[#56657A] outline-none font-mono"
                  />
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: form.wl_cor }}>A</div>
                </div>
                <p className="text-xs text-[#3F516A] mt-1.5">Aplicada em botões, destaques e ícones do sistema.</p>
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
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#788698]">
                  <span>👥 Até {planoAtual.usuarios === 999 ? 'ilimitados' : planoAtual.usuarios} usuário{planoAtual.usuarios !== 1 ? 's' : ''}</span>
                  <span>📋 Até {planoAtual.leads === 99999 ? 'ilimitados' : planoAtual.leads} leads</span>
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
                    <p className="text-sm font-semibold text-[#1F2A39]">{getNomeUsuario(m)}</p>
                    <p className="text-xs text-[#788698]">{getEmailUsuario(m)}</p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#16212E]/[0.04] text-[#788698] capitalize">{m.role}</span>
                </div>
              ))}
              <p className="text-xs text-[#3F516A] pt-2">
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
        className="w-full bg-white border border-[#16212E]/[0.08] rounded-[10px] px-4 py-2.5 text-sm text-[#56657A] placeholder:text-[#3F516A] outline-none focus:border-[#16212E]/[0.08] transition-colors" />
    </div>
  )
}
