import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { CheckImeiView, type ConsultaImei } from './check-imei-view'

export const metadata = { title: 'Check IMEI' }

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

export default async function CheckImeiPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])

  const { data } = await supabase
    .from('imei_consultas')
    .select('id, imei, resultado, motivo, observacoes, consultado_em, usuarios!consultado_por(nome)')
    .eq('empresa_id', empresaId)
    .order('consultado_em', { ascending: false })
    .limit(200)

  type Row = {
    id: number; imei: string; resultado: string; motivo: string | null
    observacoes: string | null; consultado_em: string
    usuarios: Embed<{ nome: string | null }>
  }
  const consultas: ConsultaImei[] = ((data ?? []) as unknown as Row[]).map((c) => ({
    id: c.id,
    imei: c.imei,
    resultado: c.resultado,
    motivo: c.motivo,
    observacoes: c.observacoes,
    consultado_em: c.consultado_em,
    consultado_por_nome: one(c.usuarios)?.nome ?? null,
  }))

  return <CheckImeiView consultas={consultas} />
}
