import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import { carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { AgendarView } from './agendar-view'
import { horarioDaAgenda } from '@/lib/agendar-slots'
import { fusoDaEmpresa } from '@/lib/fuso-empresa'
import { agora } from '@/lib/datas'

export const metadata = { title: 'Agendar horário' }

export default async function AgendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('id, nome, ...empresa_branding(wl_logo_url:logo_url, wl_cor:cor)').eq('slug', slug).maybeSingle()
  if (!empresa) notFound()
  // Mesma regra da rota /api/agendar: quem não tem agenda não tem formulário de
  // agendamento. Sem isto o visitante preenchia o formulário e tomava erro no fim.
  // Só recebe agendamento a empresa com a Agenda ligada.
  if (!ligadosDaEmpresa(await carregarConfigEmpresa(svc, empresa.id)).has('/agenda')) notFound()

  // O "agora" do SERVIDOR vai para a tela: servidor e navegador marcam os mesmos
  // horários como passados (antes cada lado usava o seu relógio e o seu fuso).
  const agoraMs = agora().getTime()
  const [{ data: horarioRow }, { data: ocupadasRaw }, fuso] = await Promise.all([
    svc.from('configuracoes_sistema').select('valor').eq('empresa_id', empresa.id).eq('chave', 'horario_comercial').maybeSingle(),
    svc.from('visitas').select('data_hora').eq('empresa_id', empresa.id).neq('status', 'cancelada').gte('data_hora', new Date(agoraMs).toISOString()),
    fusoDaEmpresa(svc, empresa.id),
  ])

  const horario = horarioDaAgenda(horarioRow?.valor)
  const ocupadas = ((ocupadasRaw ?? []) as { data_hora: string }[]).map((o) => o.data_hora)

  return <AgendarView slug={slug} nome={empresa.nome} cor={empresa.wl_cor || '#2E5CE6'} logo={empresa.wl_logo_url} horario={horario} ocupadas={ocupadas} fuso={fuso} agoraMs={agoraMs} />
}
