'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { markSessionActive } from '@/components/layout/session-guard'
import { Check, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { Input, Button } from '@/components/ui'
import { erroCnpj, erroTelefone, mascaraCnpj, mascaraTelefone } from '@/lib/mascaras'

type Step = 'conta' | 'empresa' | 'aceite'

/** O plano base (planos_config), lido pela página no servidor. */
export interface ResumoPlano {
  nome: string
  precoCentavos: number
  descricao: string
  inclui: string[]
}

const fmtPreco = (c: number) =>
  'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const STEPS: { id: Step; label: string }[] = [
  { id: 'conta', label: 'Sua conta' },
  { id: 'empresa', label: 'Sua empresa' },
  { id: 'aceite', label: 'Termos' },
]

// local@dominio.tld; a rota confere de novo.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A chave da tela de primeiros passos (components/modules/dashboard/onboarding-card.tsx). */
const PRIMEIROS_PASSOS_DISPENSADO = 'nexus_onboarding_dismissed'

/**
 * Cadastro em 3 passos (18/11/2026, plano único): sua conta → sua empresa → aceite dos termos, da privacidade
 * e do DPA. Sem plano para escolher (o resumo ao lado é o plano base) e sem pergunta de ramo (preset "CRM geral").
 * Ao concluir, entra direto no painel com os primeiros passos.
 */
export function RegisterForm({ resumo, documentos }: {
  resumo: ResumoPlano
  documentos: { nome: string; href: string; versao: string }[]
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('conta')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [aceite, setAceite] = useState(false)
  // A loja principal segue o nome da empresa até a pessoa mexer nela.
  const [lojaEditada, setLojaEditada] = useState(false)

  const [form, setForm] = useState({
    nomeUsuario: '',
    email: '',
    telefone: '',
    senha: '',
    confirmaSenha: '',
    nomeEmpresa: '',
    cnpj: '',
    nomeLoja: '',
  })
  const nomeLoja = lojaEditada ? form.nomeLoja : form.nomeEmpresa

  function set(campo: keyof typeof form, valor: string) {
    setForm(f => ({ ...f, [campo]: valor }))
    setErro(null)
  }

  const stepIdx = STEPS.findIndex(s => s.id === step)

  function erroDoPasso(): string | null {
    if (step === 'conta') {
      if (!form.nomeUsuario.trim()) return 'Informe seu nome'
      if (!EMAIL.test(form.email.trim())) return 'E-mail inválido'
      if (!form.telefone.trim()) return 'Informe seu telefone'
      const eTel = erroTelefone(form.telefone)
      if (eTel) return eTel
      if (form.senha.length < 8) return 'Senha deve ter ao menos 8 caracteres'
      if (form.senha !== form.confirmaSenha) return 'Senhas não conferem'
    }
    if (step === 'empresa') {
      if (!form.nomeEmpresa.trim()) return 'Informe o nome da empresa'
      const eCnpj = erroCnpj(form.cnpj)
      if (eCnpj) return eCnpj
      if (!nomeLoja.trim()) return 'Informe o nome da loja principal'
    }
    if (step === 'aceite' && !aceite) return 'Aceite os termos de uso, a política de privacidade e o acordo de tratamento de dados para continuar.'
    return null
  }

  function avancar() {
    const e = erroDoPasso()
    if (e) { setErro(e); return }
    setErro(null)
    if (step === 'conta') setStep('empresa')
    else if (step === 'empresa') setStep('aceite')
    else criarConta()
  }

  function voltar() {
    setErro(null)
    if (step === 'empresa') setStep('conta')
    if (step === 'aceite') setStep('empresa')
  }

  async function criarConta() {
    setLoading(true)
    const supabase = createClient()

    try {
      // 1) cria usuário + empresa + loja + vínculo (owner) + aceite no servidor via Admin API
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.senha,
          nomeUsuario: form.nomeUsuario,
          telefone: form.telefone,
          nomeEmpresa: form.nomeEmpresa,
          cnpj: form.cnpj,
          nomeLoja,
          aceite,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Erro ao criar conta')
      // Confirmação de e-mail ligada (EXIGIR_CONFIRMACAO_EMAIL): entra só depois de abrir o link.
      if (json?.confirmarEmail) {
        setErro(null)
        setConfirmar(form.email)
        return
      }

      // 2) faz login para estabelecer a sessão no navegador
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.senha,
      })
      if (signErr) throw new Error(signErr.message)

      markSessionActive()
      // 3) primeiro acesso guiado: o painel com os primeiros passos (mesmo que outro login neste navegador
      //    os tenha dispensado).
      try { localStorage.removeItem(PRIMEIROS_PASSOS_DISPENSADO) } catch { /* sem localStorage */ }
      router.push('/dashboard')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center overflow-auto bg-bg px-6 py-12">
      <div className="flex w-full max-w-[480px] flex-col items-center lg:max-w-[820px]">

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

        <div className="mt-6 grid w-full gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        {/* Card */}
        <div className="w-full rounded-card border border-line bg-card p-7">

          {/* Passo 1 — Conta */}
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
                  autoComplete="name"
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
                <Input
                  label="Telefone / WhatsApp"
                  required
                  value={form.telefone}
                  inputMode="tel"
                  onChange={e => set('telefone', mascaraTelefone(e.target.value))}
                  placeholder="(11) 99999-9999"
                  autoComplete="tel"
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

          {/* Passo 2 — Empresa */}
          {step === 'empresa' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Sua empresa</h2>
                <p className="mt-1 text-[13px] text-ink-2">Dá para mudar tudo isso depois, em Configurações.</p>
              </div>
              <div className="space-y-3.5">
                <Input
                  label="Nome da empresa"
                  required
                  value={form.nomeEmpresa}
                  onChange={e => set('nomeEmpresa', e.target.value)}
                  placeholder="Como seus clientes conhecem você"
                  autoComplete="organization"
                />
                <Input
                  label="CNPJ (opcional)"
                  value={form.cnpj}
                  inputMode="numeric"
                  onChange={e => set('cnpj', mascaraCnpj(e.target.value))}
                  placeholder="00.000.000/0000-00"
                />
                <Input
                  label="Nome da loja principal"
                  required
                  value={nomeLoja}
                  onChange={e => { setLojaEditada(true); set('nomeLoja', e.target.value) }}
                  placeholder="Igual ao nome da empresa"
                  hint="A primeira loja da empresa; outras você cria depois."
                />
              </div>
            </div>
          )}

          {/* Passo 3 — Aceite */}
          {step === 'aceite' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Termos e privacidade</h2>
                <p className="mt-1 text-[13px] text-ink-2">Leia os documentos antes de criar a conta.</p>
              </div>
              <ul className="space-y-2">
                {documentos.map(d => (
                  <li key={d.href} className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2.5">
                    <a href={d.href} target="_blank" rel="noopener" className="text-[13px] font-medium text-ink underline underline-offset-2">{d.nome}</a>
                    <span className="text-[11px] text-ink-3">versão {d.versao}</span>
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-2 text-[12.5px] text-ink-2">
                <input type="checkbox" checked={aceite} onChange={(e) => { setAceite(e.target.checked); setErro(null) }} className="mt-0.5" />
                <span>Li e aceito os termos de uso, a política de privacidade e o acordo de tratamento de dados (DPA).</span>
              </label>
            </div>
          )}

          {confirmar && (
            <div className="mt-4 rounded-control border border-line bg-raised p-3">
              <p className="text-[12.5px] text-ink">Conta criada. Mandamos um link para <strong>{confirmar}</strong>: abra o e-mail e confirme para entrar.</p>
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
              disabled={step === 'aceite' && !aceite}
              className="flex-1"
            >
              {loading
                ? 'Criando conta…'
                : step === 'aceite'
                ? <><Check size={16} strokeWidth={1.7} /> Criar conta grátis</>
                : <>Continuar <ChevronRight size={16} strokeWidth={1.7} /></>}
            </Button>
          </div>

          {step === 'conta' && (
            <p className="mt-4 text-center text-[13px] text-ink-2">
              Já tem conta?{' '}
              <Link href="/login" className="font-medium text-accent transition-colors hover:text-ink">
                Entrar
              </Link>
            </p>
          )}
        </div>

        {/* Resumo do plano (planos_config 'base', editável no superadmin) */}
        <aside aria-label="Resumo do plano" className="w-full rounded-card border border-line bg-card p-5">
          <p className="text-[11px] font-medium text-ink-3">Plano</p>
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold text-ink">{resumo.nome}</span>
            <span className="num text-[15px] font-semibold text-ink">{fmtPreco(resumo.precoCentavos)}<span className="text-[12px] font-normal text-ink-3">/mês</span></span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {resumo.inclui.map(f => (
              <li key={f} className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
                <Check size={13} strokeWidth={1.7} className="mt-0.5 flex-none text-ok" /> {f}
              </li>
            ))}
          </ul>
          {resumo.descricao && (
            <p className="mt-3 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">{resumo.descricao}</p>
          )}
        </aside>
        </div>
      </div>
    </div>
  )
}
