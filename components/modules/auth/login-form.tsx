'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Mail, Lock, Check, Package, ShoppingCart, Users, BarChart2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const FIELD_BASE = 'flex items-center gap-2.5 px-[14px] py-3 rounded-[12px] transition-all border'
const FIELD_IDLE = 'bg-[rgba(22,32,46,.05)] border-[rgba(22,32,46,.12)]'
const FIELD_FOCUS = 'focus-within:border-[rgba(240,101,107,.55)] focus-within:bg-[rgba(22,32,46,.035)]'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading, setLoading]   = useState(false)

  // Clear any leftover Supabase tokens from localStorage (from before this change)
  useEffect(() => {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sb-')) localStorage.removeItem(k)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      if (error.message.includes('Invalid login credentials')) toast.error('E-mail ou senha incorretos.')
      else if (error.message.includes('Too many requests')) toast.error('Muitas tentativas. Aguarde alguns minutos.')
      else toast.error(error.message)
      return
    }
    toast.success('Acesso autorizado!')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email */}
      <div>
        <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">E-MAIL</label>
        <div className={`${FIELD_BASE} ${FIELD_IDLE} ${FIELD_FOCUS}`}>
          <Mail size={19} className="text-[#5A6A7E] shrink-0" />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="voce@jmstore.com.br"
            autoComplete="username"
            required
            className="bg-transparent flex-1 text-[14px] text-[#16212E] placeholder:text-[#8A96A6] outline-none"
          />
        </div>
      </div>

      {/* Senha */}
      <div>
        <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">SENHA</label>
        <div className={`${FIELD_BASE} ${FIELD_IDLE} ${FIELD_FOCUS}`}>
          <Lock size={19} className="text-[#5A6A7E] shrink-0" />
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            className="bg-transparent flex-1 text-[14px] text-[#16212E] placeholder:text-[#8A96A6] outline-none"
          />
          <button type="button" onClick={() => setShowPw(s => !s)} className="text-[#5A6A7E] hover:text-[#F0656B] transition-colors shrink-0">
            {showPw ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
      </div>

      {/* Lembrar / Esqueci */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRemember(s => !s)}
          className="flex items-center gap-2 text-[12.5px] text-[#56657A] select-none cursor-pointer"
        >
          <div
            className={`w-[18px] h-[18px] rounded-[6px] border-[1.5px] flex items-center justify-center transition-all ${
              remember ? 'bg-[#D7282F] border-[#D7282F]' : 'border-[rgba(22,32,46,.28)]'
            }`}
          >
            {remember && <Check size={11} strokeWidth={3} className="text-white" />}
          </div>
          Lembrar de mim
        </button>
        <button type="button" className="text-[12.5px] font-semibold text-[#5A6A7E] hover:text-[#F0656B] transition-colors">
          Esqueci a senha
        </button>
      </div>

      {/* Entrar */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2.5 py-[14px] rounded-[13px] bg-gradient-to-b from-[#D12830] to-[#A8161D] text-white text-[14.5px] font-bold shadow-[0_6px_16px_rgba(168,22,29,.28)] hover:-translate-y-[2px] hover:shadow-[0_10px_22px_rgba(168,22,29,.36)] transition-all disabled:opacity-55 disabled:cursor-not-allowed disabled:transform-none"
      >
        {loading ? <><Loader2 size={19} className="animate-spin" /> Entrando…</> : 'Entrar'}
      </button>

      {/* Recursos */}
      <div className="pt-1">
        <div className="flex items-center gap-3 my-[18px]">
          <span className="flex-1 h-px bg-[rgba(22,32,46,.10)]" />
          <span className="font-mono text-[9px] tracking-[0.16em] text-[#8A96A6]">TUDO NUM SÓ LUGAR</span>
          <span className="flex-1 h-px bg-[rgba(22,32,46,.10)]" />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'ESTOQUE',    icon: Package,      color: '#2E73C4' },
            { label: 'VENDAS',     icon: ShoppingCart, color: '#34D399' },
            { label: 'CLIENTES',   icon: Users,        color: '#C6A86A' },
            { label: 'RELATÓRIOS', icon: BarChart2,    color: '#F0656B' },
          ].map(({ label, icon: Icon, color }) => (
            <div key={label} className="flex flex-col items-center gap-[7px] py-[10px] px-1 rounded-[12px] bg-[rgba(22,32,46,.04)] border border-[rgba(22,32,46,.06)]">
              <Icon size={20} style={{ color }} strokeWidth={1.6} />
              <span className="font-mono text-[8.5px] tracking-[0.1em] text-[#5A6A7E]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </form>
  )
}
