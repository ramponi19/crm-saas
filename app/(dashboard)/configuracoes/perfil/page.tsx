import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui'
import { NotificacoesCard } from '@/components/modules/configuracoes/notificacoes-card'
import { AusenciaPopover } from '@/components/layout/ausencia-popover'

export const metadata = { title: 'Perfil' }

/**
 * Perfil: o que é de cada pessoa, não da loja. Hoje são as preferências de
 * notificação (eram uma aba das Configurações do dono, e a tabela já é por
 * usuário — `notificacao_prefs`, RLS do próprio) e a ausência, que também abre
 * pelo nome no rodapé do menu. Idioma e senha entram quando existirem.
 */
export default function PerfilPage() {
  return (
    <>
      <Topbar title="Perfil" />
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[980px] space-y-4">
          <NotificacoesCard />
          <Card title="Ausência">
            <AusenciaPopover embutido userName="" userRole="" nomeClasse="" papelClasse="" />
          </Card>
        </div>
      </main>
    </>
  )
}
