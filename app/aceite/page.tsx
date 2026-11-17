import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { aceitouVigentes, versoesVigentes } from '@/lib/termos'
import { AceiteForm } from './aceite-form'

export const metadata = { title: 'Termos de uso' }

/** O aceite das versões vigentes dos termos e da privacidade (lib/termos.ts), uma vez por versão. */
export default async function AceitePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const v = versoesVigentes()
  if (!v || await aceitouVigentes(supabase, user.id)) redirect('/entrar')
  return <AceiteForm versaoTermos={v.termos} versaoPrivacidade={v.privacidade} />
}
