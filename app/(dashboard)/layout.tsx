import { Sidebar } from '@/components/layout/sidebar'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: usuarioRaw } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', user.id)
    .single()

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ativo', true)
    .eq('kanban_status', 'novo')

  const usuario = usuarioRaw as { nome: string; role: string } | null

  return (
    <div className="flex h-screen bg-[#0A111E] overflow-hidden">
      <Sidebar
        userName={usuario?.nome ?? user.email ?? 'Usuário'}
        userRole={usuario?.role === 'admin' ? 'Administrador' : 'Vendedor'}
        leadsCount={leadsCount ?? 0}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
