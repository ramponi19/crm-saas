import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import { OrcamentoPublicoView, type OrcamentoPublico } from './orcamento-view'

export const metadata = { title: 'Orçamento' }

export default async function OrcamentoTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const svc = createServiceClient()

  const { data: orc } = await svc.from('orcamentos')
    .select('id, empresa_id, tipo, status, cliente_nome, aparelho, imei, defeito, prazo_dias, garantia_dias, itens, aparelho_novo, valor_novo, aparelho_usado, valor_entrada, total, valor_devolver, acerto, observacoes, created_at')
    .eq('token', token).maybeSingle()
  if (!orc) notFound()

  const { data: empresa } = await svc.from('empresas').select('nome, wl_cor, wl_logo_url').eq('id', orc.empresa_id).maybeSingle()

  const dados: OrcamentoPublico = {
    token,
    tipo: orc.tipo,
    status: orc.status,
    cliente_nome: orc.cliente_nome,
    aparelho: orc.aparelho,
    imei: orc.imei,
    defeito: orc.defeito,
    prazo_dias: orc.prazo_dias,
    garantia_dias: orc.garantia_dias,
    itens: Array.isArray(orc.itens) ? (orc.itens as unknown as OrcamentoPublico['itens']) : [],
    aparelho_novo: orc.aparelho_novo,
    valor_novo: orc.valor_novo,
    aparelho_usado: orc.aparelho_usado,
    valor_entrada: orc.valor_entrada,
    total: Number(orc.total) || 0,
    valor_devolver: Number(orc.valor_devolver) || 0,
    acerto: orc.acerto,
    observacoes: orc.observacoes,
    created_at: orc.created_at,
  }

  return <OrcamentoPublicoView dados={dados} empresaNome={empresa?.nome ?? 'Orçamento'} cor={empresa?.wl_cor || '#2E5CE6'} logo={empresa?.wl_logo_url ?? null} />
}
