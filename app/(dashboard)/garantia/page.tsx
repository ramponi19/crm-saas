import { createClient } from '@/lib/supabase/server'
import GarantiaView from './components/garantia-view'

export default async function GarantiaPage() {
  const supabase = await createClient()

  const { data: garantias } = await supabase
    .from('garantias_assistencias')
    .select(`
      *,
      clientes(nome, telefone),
      produtos(nome)
    `)
    .eq('tipo', 'garantia')
    .order('created_at', { ascending: false })

  return <GarantiaView garantias={garantias ?? []} />
}
