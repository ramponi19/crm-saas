'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'

export type Plano = 'free' | 'starter' | 'pro'

export interface Empresa {
  id: number
  nome: string
  slug: string
  plano: Plano
  status: string
  wl_cor: string | null
  wl_logo_url: string | null
  wl_slogan: string | null
  wl_whatsapp: string | null
  limite_usuarios: number
  limite_leads: number
  trial_ends_at: string | null
  // Stripe
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_status: string | null
}

interface EmpresaContextType {
  empresa: Empresa | null
  loading: boolean
  refetch: () => Promise<void>
}

const EmpresaContext = createContext<EmpresaContextType>({
  empresa: null,
  loading: true,
  refetch: async () => {},
})

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchEmpresa() {
    try {
      const supabase = createClient()
      // Pelo RPC, não por `empresa_usuarios`: super admin operando uma empresa em
      // impersonação não tem vínculo, e a consulta antiga voltava vazia — o
      // contexto ficava nulo e tudo que depende dele (banner de limite, cor do
      // white-label) simplesmente não carregava, sem erro nenhum.
      const id = await empresaAtualId(supabase)
      if (!id) { setLoading(false); return }

      const { data: emp } = await supabase
        .from('empresas').select('*').eq('id', id).maybeSingle()

      if (emp) {
        setEmpresa(emp as unknown as Empresa)
        if (emp.wl_cor) {
          document.documentElement.style.setProperty('--color-primary', emp.wl_cor)
        }
      }
    } catch (err) {
      console.error('Erro ao carregar empresa:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEmpresa() }, [])

  return (
    <EmpresaContext.Provider value={{ empresa, loading, refetch: fetchEmpresa }}>
      {children}
    </EmpresaContext.Provider>
  )
}

export function useEmpresa() {
  return useContext(EmpresaContext)
}

export function temAcesso(plano: Plano | undefined, modulo: 'bi' | 'multi_usuario' | 'api' | 'white_label'): boolean {
  const matriz: Record<typeof modulo, Plano[]> = {
    bi:            ['starter', 'pro'],
    multi_usuario: ['starter', 'pro'],
    api:           ['pro'],
    white_label:   ['pro'],
  }
  return plano ? matriz[modulo].includes(plano) : false
}
