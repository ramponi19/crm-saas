'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function ResetSenhaPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [ready, setReady]       = useState(false)

  useEffect(() => {
    // Supabase injeta o token na URL como hash; o cliente o troca por sessão automaticamente.
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error('A senha deve ter pelo menos 8 caracteres.'); return }
    if (password !== confirm) { toast.error('As senhas não conferem.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Senha redefinida com sucesso!')
    router.replace('/login')
  }

  const FIELD = 'flex items-center gap-2.5 px-[14px] py-3 rounded-[12px] transition-all border bg-[rgba(22,32,46,.05)] border-[rgba(22,32,46,.12)] focus-within:border-[rgba(201,162,75,.55)] focus-within:bg-[rgba(22,32,46,.035)]'

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6"
      style={{ background: 'radial-gradient(130% 120% at 50% -10%, #FFFFFF 0%, #F3F1EB 45%, #E9ECF1 100%)' }}
    >
      <div className="w-full max-w-[412px]">
        <div
          className="w-full rounded-[22px] p-[30px_28px]"
          style={{
            background: 'rgba(255,255,255,.82)',
            backdropFilter: 'blur(18px)',
            border: '1px solid rgba(22,32,46,.11)',
            boxShadow: '0 24px 60px rgba(22,32,46,.14)',
          }}
        >
          <div className="text-[18px] font-bold text-[#16212E] mb-1">Redefinir senha</div>
          <div className="text-[13px] text-[#5A6A7E] mb-5">
            {ready ? 'Digite sua nova senha abaixo.' : 'Validando link de recuperação…'}
          </div>

          {ready && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">NOVA SENHA</label>
                <div className={FIELD}>
                  <Lock size={19} className="text-[#5A6A7E] shrink-0" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    className="bg-transparent flex-1 text-[14px] text-[#16212E] placeholder:text-[#8A96A6] outline-none"
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)} className="text-[#5A6A7E] hover:text-[#A8884A] transition-colors shrink-0">
                    {showPw ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block font-mono text-[10px] tracking-[0.14em] text-[#788698] mb-2">CONFIRMAR SENHA</label>
                <div className={FIELD}>
                  <Lock size={19} className="text-[#5A6A7E] shrink-0" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repita a nova senha"
                    required
                    className="bg-transparent flex-1 text-[14px] text-[#16212E] placeholder:text-[#8A96A6] outline-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 py-[14px] rounded-[13px] bg-gradient-to-b from-[#22303F] to-[#16212E] text-white text-[14.5px] font-bold shadow-[0_6px_16px_rgba(22,33,46,.28)] hover:-translate-y-[2px] transition-all disabled:opacity-55 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? <><Loader2 size={19} className="animate-spin" /> Salvando…</> : 'Salvar nova senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
