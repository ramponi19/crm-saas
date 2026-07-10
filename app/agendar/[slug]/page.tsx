import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import { AgendarView, type Horario } from './agendar-view'

export const metadata = { title: 'Agendar horário' }

export default async function AgendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('id, nome, wl_logo_url, wl_cor').eq('slug', slug).maybeSingle()
  if (!empresa) notFound()

  const [{ data: horarioRow }, { data: ocupadasRaw }] = await Promise.all([
    svc.from('configuracoes_sistema').select('valor').eq('empresa_id', empresa.id).eq('chave', 'horario_comercial').maybeSingle(),
    svc.from('visitas').select('data_hora').eq('empresa_id', empresa.id).neq('status', 'cancelada').gte('data_hora', new Date().toISOString()),
  ])

  const v = (horarioRow?.valor ?? {}) as Partial<Horario>
  const horario: Horario = {
    inicio: v.inicio ?? '09:00',
    fim: v.fim ?? '18:00',
    dias: Array.isArray(v.dias) ? v.dias : [1, 2, 3, 4, 5],
  }
  const ocupadas = ((ocupadasRaw ?? []) as { data_hora: string }[]).map((o) => o.data_hora)

  return <AgendarView slug={slug} nome={empresa.nome} cor={empresa.wl_cor || '#2E5CE6'} logo={empresa.wl_logo_url} horario={horario} ocupadas={ocupadas} />
}
