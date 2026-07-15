import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/superadmin'
import { GestaoSuperAdmins } from '@/components/superadmin/gestao-super-admins'


export default async function AdminsPage() {
  const userId = await requireSuperAdmin()
  const supabase = await createClient()

  const { data: admins } = await supabase
    .from('usuarios')
    .select('id, nome, email')
    .eq('is_super_admin', true)
    .order('nome')

  return (
    <div className="min-h-full bg-bg px-4 py-4 sm:px-8 sm:py-7">
      <div className="mx-auto max-w-[800px] space-y-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.03em] text-ink">Administradores</h1>
          <p className="mt-0.5 text-[13px] text-ink-2">Gerencie quem tem acesso de super admin ao CRM</p>
        </div>

        <GestaoSuperAdmins admins={admins ?? []} currentUserId={userId} />
      </div>
    </div>
  )
}
