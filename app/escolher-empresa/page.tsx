import { redirect } from 'next/navigation'
import { contextoDaSessao } from '@/lib/sessao'
import { EscolherEmpresa } from './escolher-empresa'

export const metadata = { title: 'Escolha a empresa' }

/**
 * ESCOLHA A EMPRESA (etapa 1.1b). Quem tem vínculo ativo com mais de uma empresa e ainda não escolheu fica sem
 * empresa (get_empresa_id nulo: a RLS nega tudo) até escolher aqui. A escolha é uma RPC auditada.
 */
export default async function Page() {
  const ctx = await contextoDaSessao()
  if (!ctx) redirect('/login')
  if (ctx.empresa_id) redirect('/dashboard')
  if (ctx.empresas.length === 0) redirect(ctx.superadmin ? '/superadmin' : '/register')
  return <EscolherEmpresa empresas={ctx.empresas} />
}
