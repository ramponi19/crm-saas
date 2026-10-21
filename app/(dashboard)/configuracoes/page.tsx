import { redirect } from 'next/navigation'
import { getEmpresaRole } from '@/lib/owner'
import { DESTINO_DA_ABA } from '@/lib/configuracoes-menu'

export const metadata = { title: 'Configurações' }

/**
 * /configuracoes abre na primeira tela que a pessoa pode usar. Link antigo com
 * `?aba=` (da época das abas) cai direto na seção que a aba virou.
 */
export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams
  if (aba && DESTINO_DA_ABA[aba]) redirect(DESTINO_DA_ABA[aba])
  const role = await getEmpresaRole()
  redirect(role === 'owner' || role === 'admin' ? '/configuracoes/empresa' : '/configuracoes/perfil')
}
