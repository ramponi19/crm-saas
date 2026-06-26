import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Landing from './landing/Landing'

// Usuários já autenticados são mandados para o dashboard.
// Visitantes veem a landing page institucional.
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/entrar')

  return <Landing />
}
