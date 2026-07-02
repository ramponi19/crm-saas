'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { markSessionActive } from '@/components/layout/session-guard'
import { Check, ChevronRight, Loader2, Eye, EyeOff } from 'lucide-react'
import { SEGMENTOS_LISTA } from '@/lib/segmentos'

type Step = 'plano' | 'loja' | 'conta'

type PlanoCard = {
  id: string
  nome: string
  preco_centavos: number
  descricao: string
  features: string[]
  destaque: boolean
}

// Fallback caso a API não responda — mantém o cadastro sempre utilizável.
const FALLBACK_PLANOS: PlanoCard[] = [
  { id: 'starter', nome: 'Starter', preco_centavos: 19700, descricao: 'Para pequenas equipes', features: ['3 usuários', '500 leads', 'PDV completo', 'Relatórios', 'Integrações básicas'], destaque: false },
  { id: 'pro', nome: 'Pro', preco_centavos: 39700, descricao: 'Para negócios em crescimento', features: ['10 usuários', 'Leads ilimitados', 'Tudo do Starter', 'White-label', 'Suporte prioritário'], destaque: true },
  { id: 'unlimited', nome: 'Unlimited', preco_centavos: 69700, descricao: 'Sem limites', features: ['Usuários ilimitados', 'Leads ilimitados', 'Tudo do Pro', 'API dedicada', 'SLA garantido'], destaque: false },
]

const fmtPreco = (c: number) =>
  'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '/mês'

const STEPS: { id: Step; label: string }[] = [
  { id: 'plano', label: 'Plano' },
  { id: 'loja',  label: 'Sua loja' },
  { id: 'conta', label: 'Sua conta' },
]

const FIELD = 'w-full bg-[rgba(22,32,46,.05)] border border-[rgba(22,32,46,.12)] rounded-[12px] px-[14px] py-3 text-[14px] text-[#141E2C] placeholder:text-[#8A96A6] outline-none focus:border-[rgba(201,162,75,.5)] transition-colors'

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('plano')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [planos, setPlanos] = useState<PlanoCard[]>(FALLBACK_PLANOS)

  const [form, setForm] = useState({
    plano: 'pro',
    segmento: 'varejo',
    nomeEmpresa: '',
    cnpj: '',
    telefone: '',
    nomeUsuario: '',
    email: '',
    senha: '',
    confirmaSenha: '',
  })

  // planos vêm da mesma fonte da vitrine/checkout (planos_config, via API pública)
  useEffect(() => {
    let active = true
    fetch('/api/planos-publicos')
      .then((r) => r.json())
      .then((d) => {
        if (!active || !Array.isArray(d?.plans) || d.plans.length === 0) return
        const mapped: PlanoCard[] = d.plans.map((p: PlanoCard) => ({
          id: p.id,
          nome: p.nome,
          preco_centavos: p.preco_centavos,
          descricao: p.descricao ?? '',
          features: Array.isArray(p.features) ? p.features : [],
          destaque: !!p.destaque,
        }))
        setPlanos(mapped)
        // garante que o plano selecionado exista na lista carregada
        setForm((f) => {
          if (mapped.some((m) => m.id === f.plano)) return f
          const def = mapped.find((m) => m.destaque) ?? mapped[0]
          return def ? { ...f, plano: def.id } : f
        })
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  function set(campo: string, valor: string) {
    setForm(f => ({ ...f, [campo]: valor }))
    setErro(null)
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
      // 1) cria usuário + empresa + vínculo (owner) no servidor via Admin API
      //    (sem envio de e-mail e sem o rate limit do signUp público)
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.senha,
          nomeUsuario: form.nomeUsuario,
          nomeEmpresa: form.nomeEmpresa,
          cnpj: form.cnpj,
          telefone: form.telefone,
          plano: form.plano,
          segmento: form.segmento,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Erro ao criar conta')

      // 2) faz login para estabelecer a sessão no navegador
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.senha,
      })
      if (signErr) throw new Error(signErr.message)

      markSessionActive()
      // Novo cadastro cria o dono (owner) → abre direto no painel de administração.
      router.push('/admin')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 overflow-auto flex items-center justify-center p-6"
      style={{ background: 'radial-gradient(130% 120% at 50% -10%, #FFFFFF 0%, #F7F4EC 45%, #EFE9DC 100%)' }}
    >
      {/* Aurora blobs — gold / navy (identidade ÁPICE) */}
      <div className="fixed top-[-12%] left-[8%] w-[520px] h-[520px] rounded-full pointer-events-none blur-[36px] animate-[jmDrift1_16s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(201,162,75,.28), transparent 68%)' }} />
      <div className="fixed bottom-[-18%] right-[6%] w-[600px] h-[600px] rounded-full pointer-events-none blur-[44px] animate-[jmDrift2_21s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(20,30,44,.10), transparent 66%)' }} />

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
            <div className="absolute rounded-full border border-dashed border-[rgba(201,162,75,.35)] animate-spin"
              style={{ inset: '-10px', animationDuration: '26s' }} />
            <img src="/eagle-navy.png" alt="ÁPICE" className="w-[72px] h-[72px] object-contain drop-shadow-lg" />
          </div>
          <div className="font-serif font-medium text-[28px] tracking-[-0.01em] text-[#141E2C] leading-none">ÁPICE</div>
          <div className="font-mono text-[9px] tracking-[0.36em] text-[#7A6A45] mt-2 pl-[0.36em]">O CRM DO EMPREENDEDOR</div>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-1.5 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                i < stepIdx
                  ? 'bg-[rgba(34,197,94,.12)] text-[#16A34A]'
                  : i === stepIdx
                  ? 'bg-[rgba(201,162,75,.14)] text-[#A8884A]'
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
                {planos.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set('plano', p.id)}
                    className={`w-full text-left p-4 rounded-[14px] border transition-all ${
                      form.plano === p.id
                        ? 'border-[rgba(201,162,75,.5)] bg-[rgba(201,162,75,.06)]'
                        : 'border-[rgba(22,32,46,.10)] hover:border-[rgba(22,32,46,.20)] bg-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${
                          form.plano === p.id ? 'border-[#C9A24B]' : 'border-[rgba(22,32,46,.25)]'
                        }`}>
                          {form.plano === p.id && <div className="w-1.5 h-1.5 rounded-full bg-[#C9A24B]" />}
                        </div>
                        <span className="text-[14px] font-semibold text-[#16212E]">{p.nome}</span>
                        {p.destaque && (
                          <span className="text-[10px] bg-[rgba(201,162,75,.16)] text-[#A8884A] px-2 py-0.5 rounded-full font-medium">
                            Popular
                          </span>
                        )}
                      </div>
                      <span className="text-[13px] font-bold text-[#141E2C]">{fmtPreco(p.preco_centavos)}</span>
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

              <div>
                <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">SEGMENTO DO NEGÓCIO *</label>
                <div className="grid grid-cols-2 gap-2">
                  {SEGMENTOS_LISTA.map(({ id, config }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => set('segmento', id)}
                      className={`text-left p-3 rounded-[12px] border transition-all ${
                        form.segmento === id
                          ? 'border-[rgba(201,162,75,.5)] bg-[rgba(201,162,75,.06)]'
                          : 'border-[rgba(22,32,46,.10)] hover:border-[rgba(22,32,46,.20)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[16px]">{config.emoji}</span>
                        <span className="text-[13px] font-semibold text-[#141E2C]">{config.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#788698] hover:text-[#C9A24B] transition-colors">
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
              className="flex-1 flex items-center justify-center gap-2 py-[14px] rounded-[13px] bg-gradient-to-b from-[#D9BC7A] to-[#C9A24B] text-[#0B1119] text-[14.5px] font-bold shadow-[0_6px_16px_rgba(201,162,75,.32)] hover:-translate-y-[1px] hover:shadow-[0_10px_22px_rgba(201,162,75,.45)] transition-all disabled:opacity-55 disabled:cursor-not-allowed disabled:transform-none"
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
              <Link href="/login" className="font-semibold text-[#C9A24B] hover:text-[#A8884A] transition-colors">
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
