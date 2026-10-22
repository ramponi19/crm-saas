import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { getEmpresaRole } from '@/lib/owner'
import { carregarConfigEmpresa, inteligenciaLigada, ligadosDaEmpresa } from '@/lib/empresa-config'
import { rastrDb } from '@/lib/rastreamento/db'
import { abasDosModulos } from '@/core/modulos'
import { secoesDeConfiguracoes } from '@/lib/configuracoes-menu'
import { ConfiguracoesNav } from '@/components/configuracoes/configuracoes-nav'

/**
 * CONFIGURAÇÕES NUMA TELA SÓ (navegação nova, 21/10/2026) — substitui o /admin.
 *
 * Mora dentro do CRM (mesma sidebar, que recolhe em trilho aqui) com um menu
 * lateral próprio; ver lib/configuracoes-menu.ts. Perfil é de todo mundo; o
 * resto é só dono/admin, e quem barra é o layout do grupo `(admin)`, como o
 * layout do /admin barrava.
 *
 * As seções de módulo (portais, cardápio, agendamento) aparecem quando o módulo
 * que as traz está ligado para a empresa (22/10/2026; core/modulos.ts).
 */
export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const [supabase, empresaId, role] = await Promise.all([createClient(), getEmpresaId(), getEmpresaRole()])
  const isAdmin = role === 'owner' || role === 'admin'
  const [{ data: empresa }, zapintel] = await Promise.all([
    supabase.from('empresas').select('preset_onboarding').eq('id', empresaId ?? 0).maybeSingle(),
    isAdmin && empresaId ? inteligenciaLigada(rastrDb(), empresaId) : Promise.resolve(false),
  ])
  const cfg = await carregarConfigEmpresa(supabase, empresaId ?? 0, empresa?.preset_onboarding ?? null)
  const secoes = secoesDeConfiguracoes({ isAdmin, abasDosModulos: abasDosModulos(ligadosDaEmpresa(cfg)), zapintel })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <ConfiguracoesNav secoes={secoes} />
      {/* Mesmo contêiner do <main> do /admin: as telas de lá contam que quem rola
          é a casca, não elas (as do CRM rolam sozinhas e também cabem aqui). */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto scrollbar-thin">{children}</div>
    </div>
  )
}
