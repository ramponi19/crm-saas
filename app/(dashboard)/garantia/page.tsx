import { createClient, getEmpresaId } from '@/lib/supabase/server'
import GarantiaView from './components/garantia-view'

export default async function GarantiaPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const { data: garantias } = await supabase
    .from('garantias_assistencias')
    .select(`
      *,
      clientes(nome, telefone),
      produtos(nome)
    `)
    .eq('empresa_id', empresaId)
    .eq('tipo', 'garantia')
    .order('created_at', { ascending: false })

  return <GarantiaView garantias={garantias ?? []} />
}
