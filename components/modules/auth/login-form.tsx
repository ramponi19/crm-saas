'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { markSessionActive } from '@/components/layout/session-guard'
import { Input, Button, notify } from '@/components/ui'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // Clear any leftover Supabase tokens from localStorage (from before this change)
  useEffect(() => {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sb-')) localStorage.removeItem(k)
    })
  }, [])

  async function handleReset() {
    if (!email) { notify.bad('Digite seu e-mail primeiro.'); return }
    setResetLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-senha`,
    })
    setResetLoading(false)
    if (error) notify.bad('Erro ao enviar e-mail: ' + error.message)
    else notify.ok('E-mail de recuperação enviado! Verifique sua caixa de entrada.')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      if (error.message.includes('Invalid login credentials')) notify.bad('E-mail ou senha incorretos.')
      else if (error.message.includes('Too many requests')) notify.bad('Muitas tentativas. Aguarde alguns minutos.')
      else notify.bad(error.message)
      return
    }
    markSessionActive()
    notify.ok('Acesso autorizado!')
    router.push('/entrar')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="E-mail"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="voce@suaempresa.com.br"
        autoComplete="username"
        required
      />

      <div>
        <label htmlFor="login-senha" className="mb-1.5 block text-[12px] font-medium text-ink-2">Senha</label>
        <div className="relative">
          <Input
            id="login-senha"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleReset}
          disabled={resetLoading}
          className="text-[12px] font-medium text-accent transition-colors hover:text-ink disabled:opacity-50"
        >
          {resetLoading ? 'Enviando…' : 'Esqueci a senha'}
        </button>
      </div>

      <Button type="submit" size="lg" loading={loading} className="w-full">
        {loading ? 'Entrando…' : 'Entrar'}
      </Button>

      <p className="text-center text-[13px] text-ink-2">
        Sua primeira vez aqui?{' '}
        <Link href="/register" className="font-medium text-accent transition-colors hover:text-ink">
          Criar uma conta
        </Link>
      </p>
    </form>
  )
}
