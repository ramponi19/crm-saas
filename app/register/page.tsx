'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { markSessionActive } from '@/components/layout/session-guard'
import { Check, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { SEGMENTOS_LISTA } from '@/lib/segmentos'
import { Input, Button } from '@/components/ui'

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
    <div className="flex min-h-screen items-center justify-center overflow-auto bg-bg px-6 py-12">
      <div className="flex w-full max-w-[480px] flex-col items-center">

        {/* Logo */}
        <Image src="/nexus-logo.png" alt="Nexus" width={426} height={285} priority className="h-24 w-auto" />

        {/* Stepper */}
        <div className="mt-7 flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                i < stepIdx
                  ? 'bg-ok-soft text-ok'
                  : i === stepIdx
                  ? 'bg-accent-soft text-accent'
                  : 'bg-raised text-ink-3'
              }`}>
                {i < stepIdx
                  ? <Check size={12} strokeWidth={1.7} />
                  : <span className="num w-[14px] text-center">{i + 1}</span>}
                {s.label}
              </div>
              {i < STEPS.length - 1 && <ChevronRight size={13} strokeWidth={1.7} className="text-ink-3" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="mt-6 w-full rounded-card border border-line bg-card p-7">

          {/* Step 1 — Plano */}
          {step === 'plano' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Escolha seu plano</h2>
                <p className="mt-1 text-[13px] text-ink-2">14 dias grátis em qualquer plano. Sem cartão agora.</p>
              </div>
              <div className="space-y-2.5">
                {planos.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set('plano', p.id)}
                    className={`w-full rounded-card border p-4 text-left transition-colors ${
                      form.plano === p.id
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-card hover:border-line-soft hover:bg-bg'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 transition-colors ${
                          form.plano === p.id ? 'border-accent' : 'border-line'
                        }`}>
                          {form.plano === p.id && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                        </span>
                        <span className="text-[14px] font-semibold text-ink">{p.nome}</span>
                        {p.destaque && (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                            Popular
                          </span>
                        )}
                      </div>
                      <span className="num text-[13px] font-semibold text-ink">{fmtPreco(p.preco_centavos)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pl-[22px]">
                      {p.features.map(f => (
                        <span key={f} className="flex items-center gap-1 text-[11px] text-ink-2">
                          <Check size={11} strokeWidth={1.7} className="text-ok" /> {f}
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
                <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Sobre sua loja</h2>
                <p className="mt-1 text-[13px] text-ink-2">Configure seu sistema em menos de 2 minutos.</p>
              </div>

              <div>
                <label className="mb-2 block text-[12px] font-medium text-ink-2">Segmento do negócio <span className="text-bad">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {SEGMENTOS_LISTA.map(({ id, config }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => set('segmento', id)}
                      className={`rounded-control border p-3 text-left transition-colors ${
                        form.segmento === id
                          ? 'border-accent bg-accent-soft'
                          : 'border-line hover:border-line-soft hover:bg-bg'
                      }`}
                    >
                      <span className="text-[13px] font-semibold text-ink">{config.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3.5">
                <Input
                  label="Nome da loja"
                  required
                  value={form.nomeEmpresa}
                  onChange={e => set('nomeEmpresa', e.target.value)}
                  placeholder="Ex: Tech Mobile, iPhone Store..."
                />
                <Input
                  label="CNPJ"
                  value={form.cnpj}
                  onChange={e => set('cnpj', e.target.value)}
                  placeholder="00.000.000/0000-00"
                />
                <Input
                  label="Telefone / WhatsApp"
                  value={form.telefone}
                  onChange={e => set('telefone', e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>
          )}

          {/* Step 3 — Conta */}
          {step === 'conta' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Sua conta de acesso</h2>
                <p className="mt-1 text-[13px] text-ink-2">Você será o administrador do sistema.</p>
              </div>
              <div className="space-y-3.5">
                <Input
                  label="Seu nome"
                  required
                  value={form.nomeUsuario}
                  onChange={e => set('nomeUsuario', e.target.value)}
                  placeholder="Nome completo"
                />
                <Input
                  label="E-mail"
                  required
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="voce@suaempresa.com.br"
                  autoComplete="username"
                />
                <div>
                  <label htmlFor="reg-senha" className="mb-1.5 block text-[12px] font-medium text-ink-2">Senha <span className="text-bad">*</span></label>
                  <div className="relative">
                    <Input
                      id="reg-senha"
                      type={showPw ? 'text' : 'password'}
                      value={form.senha}
                      onChange={e => set('senha', e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(s => !s)}
                      aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute inset-y-0 right-3 flex items-center text-ink-3 transition-colors hover:text-ink"
                    >
                      {showPw ? <EyeOff size={17} strokeWidth={1.7} /> : <Eye size={17} strokeWidth={1.7} />}
                    </button>
                  </div>
                </div>
                <Input
                  label="Confirmar senha"
                  required
                  type={showPw ? 'text' : 'password'}
                  value={form.confirmaSenha}
                  onChange={e => set('confirmaSenha', e.target.value)}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div className="mt-4 rounded-control border border-bad/20 bg-bad-soft p-3">
              <p className="text-[12px] text-bad">{erro}</p>
            </div>
          )}

          {/* Botões */}
          <div className="mt-6 flex gap-2">
            {stepIdx > 0 && (
              <Button type="button" variant="outline" size="lg" onClick={voltar} disabled={loading}>
                Voltar
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              onClick={avancar}
              loading={loading}
              className="flex-1"
            >
              {loading
                ? 'Criando conta…'
                : step === 'conta'
                ? <><Check size={16} strokeWidth={1.7} /> Criar conta grátis</>
                : <>Continuar <ChevronRight size={16} strokeWidth={1.7} /></>}
            </Button>
          </div>

          {step === 'plano' && (
            <p className="mt-4 text-center text-[13px] text-ink-2">
              Já tem conta?{' '}
              <Link href="/login" className="font-medium text-accent transition-colors hover:text-ink">
                Entrar
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
