import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { criarLead, lerLead } from '@/lib/leads'

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * POST — cria o lead pela tela (Novo lead), em `negocios` + `contatos` (lib/leads.ts).
 * Era o insert na view `leads`, que o gatilho separava. Qualquer papel da empresa, como
 * o insert na view permitia; a empresa é a da sessão e a loja é a de gravação de quem
 * cria (a escolhida no topo, ou a dele) — pelo serviço, sem isto o negócio cairia na matriz.
 *
 * Telefone que já existe na empresa (em qualquer loja) marca o MESMO contato: o lead
 * novo é um negócio novo dele, nunca um segundo contato.
 */
export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
  if (auth.error) return auth.error
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const nome = texto(b?.nome)
  if (!nome) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })

  const svc = createServiceClient()
  const funilId = Number(b?.funil_id) || null
  if (funilId) {
    const { data: f } = await svc.from('funis').select('id').eq('id', funilId).eq('empresa_id', auth.empresaId).maybeSingle()
    if (!f) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 400 })
  }
  const responsavel = texto(b?.responsavel_id)
  if (responsavel) {
    const { data: u } = await svc.from('empresa_usuarios').select('usuario_id')
      .eq('empresa_id', auth.empresaId).eq('usuario_id', responsavel).eq('ativo', true).maybeSingle()
    if (!u) return NextResponse.json({ error: 'Responsável não é da empresa' }, { status: 400 })
  }
  // O cliente que entra no funil (ficha da imobiliária) já é o contato: o lead é dele,
  // mesmo sem telefone. Só um contato que quem cria enxerga (RLS da sessão).
  const contatoId = Number(b?.contato_id) || null
  if (contatoId) {
    const { data: c } = await auth.supabase.from('contatos').select('id').eq('id', contatoId).maybeSingle()
    if (!c) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
  }
  const valor = b?.valor_estimado == null || b.valor_estimado === '' ? null : Number(b.valor_estimado)

  const { data: filial } = await auth.supabase.rpc('filial_gravacao', { p_empresa: auth.empresaId })
  const r = await criarLead(svc, auth.empresaId, {
    contato_id: contatoId,
    nome,
    telefone: texto(b?.telefone),
    instagram: texto(b?.instagram),
    origem: texto(b?.origem),
    produto_interessado: texto(b?.produto_interessado),
    valor_estimado: Number.isFinite(valor) ? valor : null,
    kanban_status: texto(b?.kanban_status),
    responsavel_id: responsavel,
    observacoes: texto(b?.observacoes),
    funil_id: funilId,
    filial_id: typeof filial === 'number' ? filial : null,
  })
  if (r.error != null || r.id == null) return NextResponse.json({ error: r.error ?? 'falha ao criar' }, { status: r.status ?? 500 })

  // Na forma que o quadro usa (components/modules/leads/types.ts): lead novo, sem conversa.
  const lead = await lerLead(svc, r.id)
  return NextResponse.json({
    lead: lead && { ...lead, msgs_nao_lidas: 0, ultima_mensagem_at: null, ultima_recebida_at: null, ultima_enviada_at: null },
  })
}
