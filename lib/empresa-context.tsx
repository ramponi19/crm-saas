'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Busca empresa via vínculo usuario ↔ empresa
      const { data } = await supabase
        .from('empresa_usuarios')
        .select('empresa:empresas(*)')
        .eq('usuario_id', user.id)
        .eq('ativo', true)
        .single()

      if (data?.empresa) {
        const emp = data.empresa as unknown as Empresa
        setEmpresa(emp)

        // Aplica white-label: cor primária
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

// Helper: verifica se o plano tem acesso a um módulo
export function temAcesso(plano: Plano | undefined, modulo: 'bi' | 'multi_usuario' | 'api' | 'white_label'): boolean {
  const matriz: Record<typeof modulo, Plano[]> = {
    bi:            ['starter', 'pro'],
    multi_usuario: ['starter', 'pro'],
    api:           ['pro'],
    white_label:   ['pro'],
  }
  return plano ? matriz[modulo].includes(plano) : false
}
