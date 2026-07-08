'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input, Button, notify } from '@/components/ui'

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
    if (password.length < 8) { notify.bad('A senha deve ter pelo menos 8 caracteres.'); return }
    if (password !== confirm) { notify.bad('As senhas não conferem.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { notify.bad('Erro: ' + error.message); return }
    notify.ok('Senha redefinida com sucesso!')
    router.replace('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center">
          <Image src="/nexus-logo.png" alt="Nexus" width={503} height={431} priority className="h-24 w-auto" />
        </div>

        <div className="mt-8 rounded-card border border-line bg-card p-7">
          <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Redefinir senha</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {ready ? 'Digite sua nova senha abaixo.' : 'Validando link de recuperação…'}
          </p>

          {ready && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="reset-senha" className="mb-1.5 block text-[12px] font-medium text-ink-2">Nova senha</label>
                <div className="relative">
                  <Input
                    id="reset-senha"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
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
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repita a nova senha"
                required
              />

              <Button type="submit" size="lg" loading={loading} className="w-full">
                {loading ? 'Salvando…' : 'Salvar nova senha'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
