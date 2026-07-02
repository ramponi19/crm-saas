import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/superadmin'
import { GestaoSuperAdmins } from '@/components/superadmin/gestao-super-admins'

const ADMIN_COR = '#7C3AED'

export default async function AdminsPage() {
  const userId = await requireSuperAdmin()
  const supabase = await createClient()

  const { data: admins } = await supabase
    .from('usuarios')
    .select('id, nome, email')
    .eq('is_super_admin', true)
    .order('nome')

  return (
    <div className="px-8 py-7 max-w-[800px]">
      <div className="mb-6">
        <h1 className="font-serif font-medium text-[26px] text-[#16212E] tracking-[-0.02em]">
          Administradores
        </h1>
        <p className="text-[14px] text-[#788698] mt-1">
          Gerencie quem tem acesso de super admin ao CRM
        </p>
      </div>

      <GestaoSuperAdmins admins={admins ?? []} currentUserId={userId} />
    </div>
  )
}
