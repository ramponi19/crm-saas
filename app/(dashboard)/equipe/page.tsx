import { createClient } from '@/lib/supabase/server'
import EquipeView from './components/equipe-view'

export default async function EquipePage() {
  const supabase = await createClient()
  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('*')
    .order('nome')
  return <EquipeView usuarios={usuarios ?? []} />
}
