'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { markSessionActive } from '@/components/layout/session-guard'
import type { TablesInsert } from '@/types/database'
import { Check, ChevronRight, Loader2, Eye, EyeOff } from 'lucide-react'

type Step = 'plano' | 'loja' | 'conta'

const PLANOS = [
  {
    id: 'free',
    nome: 'Free',
    preco: 'Grátis',
    descricao: 'Para começar sem custo',
    cor: '#5C6E84',
    features: ['1 usuário', '100 leads', 'PDV básico', 'Estoque'],
    destaque: false,
  },
  {
    id: 'starter',
    nome: 'Starter',
    preco: 'R$ 197/mês',
    descricao: 'Para lojas em crescimento',
    cor: '#2E73C4',
    features: ['3 usuários', '500 leads', 'Todos os módulos', 'BI e Relatórios', 'WhatsApp integrado'],
    destaque: true,
  },
  {
    id: 'pro',
    nome: 'Pro',
    preco: 'R$ 397/mês',
    descricao: 'Para redes de lojas',
    cor: '#D7282F',
    features: ['Usuários ilimitados', 'Leads ilimitados', 'White-label', 'API acesso', 'Suporte prioritário'],
    destaque: false,
  },
]

const STEPS: { id: Step; label: string }[] = [
  { id: 'plano', label: 'Plano' },
  { id: 'loja',  label: 'Sua loja' },
  { id: 'conta', label: 'Sua conta' },
]

const FIELD = 'w-full bg-[rgba(22,32,46,.05)] border border-[rgba(22,32,46,.12)] rounded-[12px] px-[14px] py-3 text-[14px] text-[#16212E] placeholder:text-[#8A96A6] outline-none focus:border-[rgba(215,40,47,.45)] transition-colors'

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('plano')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [showPw, setShowPw] = useState(false)

  const [form, setForm] = useState({
    plano: 'starter',
    nomeEmpresa: '',
    cnpj: '',
    telefone: '',
    nomeUsuario: '',
    email: '',
    senha: '',
    confirmaSenha: '',
  })

  function set(campo: string, valor: string) {
    setForm(f => ({ ...f, [campo]: valor }))
    setErro(null)
  }

  function slugify(text: string) {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const stepIdx = STEPS.findIndex(s => s.id === step)

  function avancar() {
    setErro(null)
    if (step === 'plano') {
      setStep('loja')
    } else if (step === 'loja') {
      if (!form.nomeEmpresa.trim()) { setErro('Informe o nome da loja'); return }
      setStep('conta')
    } else {
      criarConta()
    }
  }

  function voltar() {
    if (step === 'loja') setStep('plano')
    if (step === 'conta') setStep('loja')
  }

  async function criarConta() {
    if (!form.nomeUsuario.trim()) { setErro('Informe seu nome'); return }
    if (!form.email.includes('@')) { setErro('E-mail inválido'); return }
    if (form.senha.length < 8) { setErro('Senha deve ter ao menos 8 caracteres'); return }
    if (form.senha !== form.confirmaSenha) { setErro('Senhas não conferem'); return }

    setLoading(true)
    const supabase = createClient()

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.senha,
        options: { data: { nome: form.nomeUsuario } },
      })
      if (authError) throw new Error(authError.message)
      const userId = authData.user?.id
      if (!userId) throw new Error('Erro ao criar usuário')

      const slug = slugify(form.nomeEmpresa) + '-' + Math.random().toString(36).slice(2, 6)
      const { data: empresaData, error: empresaError } = await supabase
        .from('empresas')
        .insert({
          nome: form.nomeEmpresa,
          slug,
          plano: form.plano,
          cnpj: form.cnpj || null,
          telefone: form.telefone || null,
          wl_whatsapp: form.telefone || null,
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single()
      if (empresaError) throw new Error('Erro ao criar empresa: ' + empresaError.message)

      const empresaId = empresaData!.id

      await supabase.from('usuarios').insert({
        id: userId,
        nome: form.nomeUsuario,
        email: form.email,
        role: 'admin',
        empresa_id: empresaId,
      } as TablesInsert<'usuarios'>)

      await supabase.from('empresa_usuarios').insert({
        empresa_id: empresaId,
        usuario_id: userId,
        role: 'owner',
      })

      markSessionActive()
      router.push('/dashboard')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 overflow-auto flex items-center justify-center p-6"
      style={{ background: 'radial-gradient(130% 120% at 50% -10%, #FFFFFF 0%, #F3F1EB 45%, #E9ECF1 100%)' }}
    >
      {/* Aurora blobs */}
      <div className="fixed top-[-12%] left-[8%] w-[520px] h-[520px] rounded-full pointer-events-none blur-[36px] animate-[jmDrift1_16s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(215,40,47,.28), transparent 68%)' }} />
      <div className="fixed bottom-[-18%] right-[6%] w-[600px] h-[600px] rounded-full pointer-events-none blur-[44px] animate-[jmDrift2_21s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(46,115,196,.14), transparent 66%)' }} />

      {/* Grid overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(22,32,46,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(22,32,46,.04) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(120% 90% at 50% 30%, #000 30%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(120% 90% at 50% 30%, #000 30%, transparent 75%)',
      }} />

      <div className="relative z-10 w-full max-w-[480px] flex flex-col items-center py-8">

        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <div className="relative w-[80px] h-[80px] flex items-center justify-center mb-4">
            <div className="absolute rounded-full border border-dashed border-[rgba(120,134,150,.30)] animate-spin"
              style={{ inset: '-10px', animationDuration: '26s' }} />
            <img src="/eagle-mark.png" alt="Logo" className="w-[72px] h-[72px] object-contain drop-shadow-lg" />
          </div>
          <div className="font-serif font-medium text-[26px] tracking-[-0.02em] text-[#16212E] leading-none">CRM</div>
          <div className="font-mono text-[9px] tracking-[0.42em] text-[#788698] mt-2 pl-[0.42em]">PLATAFORMA DE GESTÃO</div>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-1.5 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                i < stepIdx
                  ? 'bg-[rgba(34,197,94,.12)] text-[#16A34A]'
                  : i === stepIdx
                  ? 'bg-[rgba(215,40,47,.10)] text-[#D7282F]'
                  : 'bg-[rgba(22,32,46,.06)] text-[#788698]'
              }`}>
                {i < stepIdx ? <Check size={11} strokeWidth={2.5} /> : <span className="w-[14px] text-center">{i + 1}</span>}
                {s.label}
              </div>
              {i < STEPS.length - 1 && <ChevronRight size={13} className="text-[#B0BCC9]" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="w-full rounded-[22px] p-[30px_28px]" style={{
          background: 'rgba(255,255,255,.82)',
          backdropFilter: 'blur(18px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
          border: '1px solid rgba(22,32,46,.11)',
          boxShadow: '0 24px 60px rgba(22,32,46,.12)',
        }}>

          {/* Step 1 — Plano */}
          {step === 'plano' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[18px] font-bold text-[#16212E]">Escolha seu plano</h2>
                <p className="text-[13px] text-[#5A6A7E] mt-1">14 dias grátis em qualquer plano. Sem cartão agora.</p>
              </div>
              <div className="space-y-2.5">
                {PLANOS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set('plano', p.id)}
                    className={`w-full text-left p-4 rounded-[14px] border transition-all ${
                      form.plano === p.id
                        ? 'border-[rgba(215,40,47,.40)] bg-[rgba(215,40,47,.04)]'
                        : 'border-[rgba(22,32,46,.10)] hover:border-[rgba(22,32,46,.20)] bg-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${
                          form.plano === p.id ? 'border-[#D7282F]' : 'border-[rgba(22,32,46,.25)]'
                        }`}>
                          {form.plano === p.id && <div className="w-1.5 h-1.5 rounded-full bg-[#D7282F]" />}
                        </div>
                        <span className="text-[14px] font-semibold text-[#16212E]">{p.nome}</span>
                        {p.destaque && (
                          <span className="text-[10px] bg-[rgba(46,115,196,.12)] text-[#2E73C4] px-2 py-0.5 rounded-full font-medium">
                            Popular
                          </span>
                        )}
                      </div>
                      <span className="text-[13px] font-bold text-[#16212E]">{p.preco}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pl-[22px]">
                      {p.features.map(f => (
                        <span key={f} className="text-[11px] text-[#5A6A7E] flex items-center gap-1">
                          <Check size={9} className="text-[#16A34A]" strokeWidth={2.5} /> {f}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — Loja */}
          {step === 'loja' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[18px] font-bold text-[#16212E]">Sobre sua loja</h2>
                <p className="text-[13px] text-[#5A6A7E] mt-1">Configure seu sistema em menos de 2 minutos.</p>
              </div>
              <div className="space-y-3.5">
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">NOME DA LOJA *</label>
                  <input
                    value={form.nomeEmpresa}
                    onChange={e => set('nomeEmpresa', e.target.value)}
                    placeholder="Ex: Tech Mobile, iPhone Store..."
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">CNPJ</label>
                  <input
                    value={form.cnpj}
                    onChange={e => set('cnpj', e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">TELEFONE / WHATSAPP</label>
                  <input
                    value={form.telefone}
                    onChange={e => set('telefone', e.target.value)}
                    placeholder="(11) 99999-9999"
                    className={FIELD}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Conta */}
          {step === 'conta' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[18px] font-bold text-[#16212E]">Sua conta de acesso</h2>
                <p className="text-[13px] text-[#5A6A7E] mt-1">Você será o administrador do sistema.</p>
              </div>
              <div className="space-y-3.5">
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">SEU NOME *</label>
                  <input
                    value={form.nomeUsuario}
                    onChange={e => set('nomeUsuario', e.target.value)}
                    placeholder="Nome completo"
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">E-MAIL *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="voce@suaempresa.com.br"
                    autoComplete="username"
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">SENHA *</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={form.senha}
                      onChange={e => set('senha', e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      className={FIELD + ' pr-11'}
                    />
                    <button type="button" onClick={() => setShowPw(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#788698] hover:text-[#D7282F] transition-colors">
                      {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">CONFIRMAR SENHA *</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form.confirmaSenha}
                    onChange={e => set('confirmaSenha', e.target.value)}
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    className={FIELD}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div className="mt-4 p-3 bg-[rgba(215,40,47,.08)] border border-[rgba(215,40,47,.20)] rounded-[10px]">
              <p className="text-[12px] text-[#D7282F]">{erro}</p>
            </div>
          )}

          {/* Botões */}
          <div className={`flex gap-2 mt-6 ${stepIdx > 0 ? 'flex-row' : ''}`}>
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={voltar}
                className="px-4 py-[13px] rounded-[13px] text-[14px] text-[#788698] hover:text-[#16212E] border border-[rgba(22,32,46,.12)] hover:border-[rgba(22,32,46,.25)] transition-all"
              >
                Voltar
              </button>
            )}
            <button
              type="button"
              onClick={avancar}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-[14px] rounded-[13px] bg-gradient-to-b from-[#D12830] to-[#A8161D] text-white text-[14.5px] font-bold shadow-[0_6px_16px_rgba(168,22,29,.28)] hover:-translate-y-[1px] hover:shadow-[0_10px_22px_rgba(168,22,29,.36)] transition-all disabled:opacity-55 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading
                ? <><Loader2 size={18} className="animate-spin" /> Criando conta…</>
                : step === 'conta'
                ? <><Check size={17} /> Criar conta grátis</>
                : <>Continuar <ChevronRight size={17} /></>
              }
            </button>
          </div>

          {step === 'plano' && (
            <p className="text-center text-[13px] text-[#788698] mt-4">
              Já tem conta?{' '}
              <Link href="/login" className="font-semibold text-[#D7282F] hover:text-[#A8161D] transition-colors">
                Entrar
              </Link>
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes jmDrift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,-30px) scale(1.12); } }
        @keyframes jmDrift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-50px,30px) scale(1.18); } }
      `}</style>
    </div>
  )
}
