'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'

export type Plano = 'free' | 'starter' | 'pro'

export interface Empresa {
  id: number
  nome: string
  slug: string
  /**
   * Dados jurídicos da loja: saem no contrato de compra e venda ({{loja.cnpj}}) e
   * nos documentos impressos.
   *
   * Faltavam neste tipo, então a tela "Minha empresa" não tinha como exibi-los para
   * edição — só o cadastro inicial pedia, e quem pulasse ficava com os dois vazios
   * para sempre. Foi o que aconteceu com a JM: contrato emitido sem identificar a
   * vendedora.
   */
  cnpj: string | null
  telefone: string | null
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
  /**
   * Id da empresa AGORA, para quem vai gravar algo.
   *
   * Use isto em vez de `empresa?.id` antes de um insert: se o contexto não
   * carregou, ele resolve na hora em vez de a ação ser recusada. Devolve null só
   * quando não há empresa mesmo.
   */
  resolverEmpresaId: () => Promise<number | null>
}

const EmpresaContext = createContext<EmpresaContextType>({
  empresa: null,
  loading: true,
  refetch: async () => {},
  resolverEmpresaId: async () => null,
})

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [loading, setLoading] = useState(true)

  /** Devolve `true` quando a empresa foi carregada — o retry para nisso. */
  async function fetchEmpresa(): Promise<boolean> {
    try {
      const supabase = createClient()
      // Pelo RPC, não por `empresa_usuarios`: super admin operando uma empresa em
      // impersonação não tem vínculo, e a consulta antiga voltava vazia — o
      // contexto ficava nulo e tudo que depende dele (banner de limite, cor do
      // white-label) simplesmente não carregava, sem erro nenhum.
      const id = await empresaAtualId(supabase)
      if (!id) { setLoading(false); return false }

      const { data: emp } = await supabase
        .from('empresas').select('*').eq('id', id).maybeSingle()

      if (emp) {
        setEmpresa(emp as unknown as Empresa)
        if (emp.wl_cor) {
          document.documentElement.style.setProperty('--color-primary', emp.wl_cor)
        }
        return true
      }
      return false
    } catch (err) {
      console.error('Erro ao carregar empresa:', err)
      return false
    } finally {
      setLoading(false)
    }
  }

  /**
   * Resolve o id na hora de agir.
   *
   * A busca acontecia UMA vez, ao abrir a tela. Se falhasse ali — rede oscilando,
   * token em renovação —, o contexto ficava vazio PARA SEMPRE, e o vendedor
   * recebia "Empresa não carregada" ao registrar uma ligação, ao converter em
   * cliente, no PDV. Uma falha de um segundo virava tela quebrada até dar F5, e
   * quem usa não tem como saber que era só recarregar.
   */
  async function resolverEmpresaId(): Promise<number | null> {
    if (empresa?.id) return empresa.id
    const id = await empresaAtualId(createClient())
    // Recuperou: repõe o contexto para as próximas ações e para o white-label.
    if (id) void fetchEmpresa()
    return id
  }

  useEffect(() => {
    let vivo = true
    // Uma falha transitória não pode custar a sessão inteira: tenta de novo,
    // espaçado, e para no primeiro sucesso.
    async function comRetry() {
      for (const espera of [0, 1500, 5000]) {
        if (!vivo) return
        if (espera) await new Promise((r) => setTimeout(r, espera))
        const ok = await fetchEmpresa()
        if (ok || !vivo) return
      }
    }
    comRetry()
    return () => { vivo = false }
  }, [])

  return (
    <EmpresaContext.Provider value={{ empresa, loading, refetch: async () => { await fetchEmpresa() }, resolverEmpresaId }}>
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
