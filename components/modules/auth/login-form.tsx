'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return

    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setLoading(false)
      if (error.message.includes('Invalid login credentials')) {
        toast.error('E-mail ou senha incorretos.')
      } else if (error.message.includes('Too many requests')) {
        toast.error('Muitas tentativas. Aguarde alguns minutos.')
      } else {
        toast.error(error.message)
      }
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
        <label className="block font-mono text-[10px] tracking-[0.14em] text-[#7E8EA2] mb-2">E-MAIL</label>
        <div className="flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.1] rounded-[12px] px-[14px] py-3 focus-within:border-[rgba(240,101,107,0.55)] focus-within:bg-white/[0.06] transition-all">
          <Mail size={19} className="text-[#8A9BB0] shrink-0" />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="voce@empresa.com.br"
            autoComplete="username"
            required
            className="bg-transparent flex-1 text-[14px] text-[#EEF2F7] placeholder:text-[#5C6E84] outline-none font-sans"
          />
        </div>
      </div>

      {/* Senha */}
      <div>
        <label className="block font-mono text-[10px] tracking-[0.14em] text-[#7E8EA2] mb-2">SENHA</label>
        <div className="flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.1] rounded-[12px] px-[14px] py-3 focus-within:border-[rgba(240,101,107,0.55)] focus-within:bg-white/[0.06] transition-all">
          <Lock size={19} className="text-[#8A9BB0] shrink-0" />
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            className="bg-transparent flex-1 text-[14px] text-[#EEF2F7] placeholder:text-[#5C6E84] outline-none font-sans"
          />
          <button type="button" onClick={() => setShowPw(s => !s)} className="text-[#8A9BB0] hover:text-[#C4CCD6] transition-colors shrink-0">
            {showPw ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2.5 py-[14px] rounded-[13px] bg-gradient-to-b from-[#D12830] to-[#A8161D] text-white text-[14.5px] font-bold font-sans shadow-[0_6px_16px_rgba(168,22,29,0.28)] hover:-translate-y-[2px] hover:shadow-[0_10px_22px_rgba(168,22,29,0.36)] transition-all disabled:opacity-55 disabled:cursor-not-allowed disabled:transform-none"
      >
        {loading ? (
          <><Loader2 size={19} className="animate-spin" /> Entrando…</>
        ) : (
          'Entrar'
        )}
      </button>

      {/* Recursos */}
      <div className="pt-2">
        <div className="flex items-center gap-3 my-4">
          <span className="flex-1 h-px bg-white/[0.08]" />
          <span className="font-mono text-[9px] tracking-[0.16em] text-[#5C6E84]">TUDO NUM SÓ LUGAR</span>
          <span className="flex-1 h-px bg-white/[0.08]" />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'ESTOQUE', color: '#9CC2EE' },
            { label: 'VENDAS', color: '#34D399' },
            { label: 'CLIENTES', color: '#C6A86A' },
            { label: 'RELATÓRIOS', color: '#F0656B' },
          ].map(({ label, color }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 py-[10px] px-1 rounded-[12px] bg-white/[0.03] border border-white/[0.05]">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="font-mono text-[8.5px] tracking-[0.1em] text-[#8A9BB0]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </form>
  )
}
