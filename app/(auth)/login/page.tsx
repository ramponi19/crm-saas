import { LoginForm } from '@/components/modules/auth/login-form'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Entrar' }

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center">
          <Image src="/nexus-logo.png" alt="Nexus" width={426} height={285} priority className="h-24 w-auto" />
        </div>

        <div className="mt-8 rounded-card border border-line bg-card p-7">
          <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Bem-vindo de volta</h1>
          <p className="mt-1 text-[13px] text-ink-2">Entre para acessar sua operação.</p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>

        <p className="mt-6 text-center text-[12px] text-ink-3">
          Acesso seguro · Nexus © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
