'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { TablesInsert } from '@/types/database'
import { Building2, User, ChevronRight, Check, Loader2, Smartphone } from 'lucide-react'

type Step = 'empresa' | 'usuario' | 'plano'

const PLANOS = [
  {
    id: 'free',
    nome: 'Free',
    preco: 'Grátis',
    descricao: 'Para começar',
    cor: '#5C6E84',
    features: ['1 usuário', '100 leads', 'PDV básico', 'Estoque'],
    destaque: false,
  },
  {
    id: 'starter',
    nome: 'Starter',
    preco: 'R$ 197/mês',
    descricao: 'Para lojas em crescimento',
    cor: '#6B8CFF',
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

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('empresa')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [form, setForm] = useState({
    // Empresa
    nomeEmpresa: '',
    whatsapp: '',
    // Usuário
    nomeUsuario: '',
    email: '',
    senha: '',
    confirmaSenha: '',
    // Plano
    plano: 'starter',
  })

  function set(campo: string, valor: string) {
    setForm(f => ({ ...f, [campo]: valor }))
    setErro(null)
  }

  function slugify(text: string) {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  async function criarConta() {
    setLoading(true)
    setErro(null)
    const supabase = createClient()

    try {
      // 1. Cria usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.senha,
        options: { data: { nome: form.nomeUsuario } },
      })
      if (authError) throw new Error(authError.message)
      const userId = authData.user?.id
      if (!userId) throw new Error('Erro ao criar usuário')

      // 2. Cria empresa
      const slug = slugify(form.nomeEmpresa) + '-' + Math.random().toString(36).slice(2, 6)
      const { data: empresaData, error: empresaError } = await supabase
        .from('empresas')
        .insert({
          nome: form.nomeEmpresa,
          slug,
          plano: form.plano,
          wl_whatsapp: form.whatsapp || null,
          // Trial de 14 dias
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single()
      if (empresaError) throw new Error('Erro ao criar empresa: ' + empresaError.message)

      const empresaId = empresaData!.id

      // 3. Cria perfil na tabela usuarios
      await supabase.from('usuarios').insert({
        id: userId,
        nome: form.nomeUsuario,
        email: form.email,
        role: 'admin',
        empresa_id: empresaId,
      } as TablesInsert<'usuarios'>)

      // 4. Vincula usuário à empresa como owner
      await supabase.from('empresa_usuarios').insert({
        empresa_id: empresaId,
        usuario_id: userId,
        role: 'owner',
      })

      // 5. Seed: cria categorias financeiras padrão para essa empresa
      const categoriasSeed = [
        { nome: 'Vendas de produtos',   tipo: 'receita', cor: '#34D399', empresa_id: empresaId },
        { nome: 'Serviços/Assistência', tipo: 'receita', cor: '#6B8CFF', empresa_id: empresaId },
        { nome: 'Outras receitas',      tipo: 'receita', cor: '#F4B740', empresa_id: empresaId },
        { nome: 'Fornecedores',         tipo: 'despesa', cor: '#F0353D', empresa_id: empresaId },
        { nome: 'Salários',             tipo: 'despesa', cor: '#EC4899', empresa_id: empresaId },
        { nome: 'Aluguel',              tipo: 'despesa', cor: '#F59E0B', empresa_id: empresaId },
        { nome: 'Outras despesas',      tipo: 'despesa', cor: '#94A3B8', empresa_id: empresaId },
      ]
      await supabase.from('categorias_financeiras').insert(categoriasSeed)

      // 6. Redireciona ao dashboard
      router.push('/dashboard')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  function avancar() {
    if (step === 'empresa') {
      if (!form.nomeEmpresa.trim()) { setErro('Informe o nome da loja'); return }
      setStep('usuario')
    } else if (step === 'usuario') {
      if (!form.nomeUsuario.trim()) { setErro('Informe seu nome'); return }
      if (!form.email.includes('@')) { setErro('E-mail inválido'); return }
      if (form.senha.length < 8) { setErro('Senha deve ter ao menos 8 caracteres'); return }
      if (form.senha !== form.confirmaSenha) { setErro('Senhas não conferem'); return }
      setStep('plano')
    } else {
      criarConta()
    }
  }

  const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: 'empresa',  label: 'Sua loja',  icon: <Building2 size={14} /> },
    { id: 'usuario',  label: 'Sua conta', icon: <User size={14} /> },
    { id: 'plano',    label: 'Plano',     icon: <Smartphone size={14} /> },
  ]

  const stepIdx = STEPS.findIndex(s => s.id === step)

  return (
    <div className="min-h-screen bg-[#0A111E] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-[8px] bg-[#D7282F] flex items-center justify-center">
              <Smartphone size={16} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">CRM Store</span>
          </div>
          <p className="text-[#5C6E84] text-sm">Sistema completo para lojas de celular</p>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                i < stepIdx
                  ? 'bg-[rgba(34,197,94,0.15)] text-[#22C55E]'
                  : i === stepIdx
                  ? 'bg-[rgba(215,40,47,0.15)] text-[#F0353D]'
                  : 'bg-white/[0.04] text-[#3F516A]'
              }`}>
                {i < stepIdx ? <Check size={12} /> : s.icon}
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight size={14} className="text-[#3F516A]" />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-[#0D1824] border border-white/[0.06] rounded-[20px] p-8">

          {/* Step 1 — Empresa */}
          {step === 'empresa' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-white text-xl font-semibold">Sobre sua loja</h2>
                <p className="text-[#5C6E84] text-sm mt-1">Vamos configurar seu sistema em menos de 2 minutos.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#8A9BB0] mb-1.5">Nome da loja *</label>
                  <input
                    value={form.nomeEmpresa}
                    onChange={e => set('nomeEmpresa', e.target.value)}
                    placeholder="Ex: Tech Mobile, iPhone Store..."
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[10px] px-4 py-3 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-[#D7282F]/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8A9BB0] mb-1.5">WhatsApp da loja</label>
                  <input
                    value={form.whatsapp}
                    onChange={e => set('whatsapp', e.target.value)}
                    placeholder="5511999999999"
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[10px] px-4 py-3 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-[#D7282F]/50 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Usuário */}
          {step === 'usuario' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-white text-xl font-semibold">Sua conta de acesso</h2>
                <p className="text-[#5C6E84] text-sm mt-1">Você será o administrador do sistema.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#8A9BB0] mb-1.5">Seu nome *</label>
                  <input
                    value={form.nomeUsuario}
                    onChange={e => set('nomeUsuario', e.target.value)}
                    placeholder="Nome completo"
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[10px] px-4 py-3 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-[#D7282F]/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#8A9BB0] mb-1.5">E-mail *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[10px] px-4 py-3 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-[#D7282F]/50 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#8A9BB0] mb-1.5">Senha *</label>
                    <input
                      type="password"
                      value={form.senha}
                      onChange={e => set('senha', e.target.value)}
                      placeholder="Mín. 8 caracteres"
                      className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[10px] px-4 py-3 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-[#D7282F]/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#8A9BB0] mb-1.5">Confirmar *</label>
                    <input
                      type="password"
                      value={form.confirmaSenha}
                      onChange={e => set('confirmaSenha', e.target.value)}
                      placeholder="Repetir senha"
                      className="w-full bg-[#0A111E] border border-white/[0.08] rounded-[10px] px-4 py-3 text-sm text-[#D4DEEA] placeholder:text-[#3F516A] outline-none focus:border-[#D7282F]/50 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Plano */}
          {step === 'plano' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-white text-xl font-semibold">Escolha seu plano</h2>
                <p className="text-[#5C6E84] text-sm mt-1">14 dias grátis em qualquer plano. Sem cartão agora.</p>
              </div>
              <div className="space-y-3">
                {PLANOS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => set('plano', p.id)}
                    className={`w-full text-left p-4 rounded-[12px] border transition-all ${
                      form.plano === p.id
                        ? 'border-[#D7282F]/50 bg-[rgba(215,40,47,0.08)]'
                        : 'border-white/[0.06] bg-[#0A111E] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: p.cor }} />
                        <span className="text-sm font-semibold text-white">{p.nome}</span>
                        {p.destaque && (
                          <span className="text-[10px] bg-[rgba(107,140,255,0.15)] text-[#6B8CFF] px-2 py-0.5 rounded-full font-medium">
                            Popular
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-bold text-[#F4F6F9]">{p.preco}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {p.features.map(f => (
                        <span key={f} className="text-xs text-[#5C6E84] flex items-center gap-1">
                          <Check size={10} className="text-[#22C55E]" /> {f}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div className="mt-4 p-3 bg-[rgba(240,53,61,0.1)] border border-[#F0353D]/20 rounded-[10px]">
              <p className="text-xs text-[#F0353D]">{erro}</p>
            </div>
          )}

          {/* Botão */}
          <button
            onClick={avancar}
            disabled={loading}
            className="w-full mt-6 bg-[#D7282F] hover:bg-[#B91C1C] disabled:opacity-50 text-white font-semibold rounded-[10px] py-3 text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Criando sua conta...</>
            ) : step === 'plano' ? (
              <>Criar conta grátis <Check size={16} /></>
            ) : (
              <>Continuar <ChevronRight size={16} /></>
            )}
          </button>

          {step === 'empresa' && (
            <p className="text-center text-xs text-[#3F516A] mt-4">
              Já tem conta?{' '}
              <a href="/login" className="text-[#6B8CFF] hover:underline">Entrar</a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
