import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPortalToken } from '@/lib/portal-token'
import { proximoResponsavel } from '@/lib/roleta'

/**
 * Webhook INBOUND de leads dos portais (Grupo OLX: ZAP, VivaReal, Imovelweb).
 * O portal faz POST de cada lead nesta URL (cadastrada no Canal Pro). Cria o
 * lead no CRM, liga ao imóvel via clientListingId (código) e distribui pela
 * roleta. 100% isolado do webhook da Meta.
 *
 * URL: /api/portais/{slug}/leads?token={token}
 * Controle por HTTP status (Grupo OLX reenviar se não-2xx).
 */

// health-check / verificação de URL pelo portal
export async function GET() {
  return NextResponse.json({ ok: true })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(obj: any, ...keys: string[]) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== '') return obj[k]
  }
  return null
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const token = new URL(req.url).searchParams.get('token')
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('id').eq('slug', slug).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

  const esperado = await getPortalToken(svc, empresa.id)
  if (!esperado || token !== esperado) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try { body = await req.json() } catch { body = {} }

  const nome = pick(body, 'name', 'nome', 'leadName', 'clientName') ?? 'Lead do portal'
  const ddd = pick(body, 'ddd', 'areaCode')
  const numero = pick(body, 'number', 'phoneNumber')
  const telefone = pick(body, 'phone', 'telephone', 'telefone', 'cellphone') ?? (ddd && numero ? `${ddd}${numero}` : null)
  const email = pick(body, 'email', 'clientEmail')
  const mensagem = pick(body, 'message', 'mensagem', 'clientMessage')
  const clientListingId = pick(body, 'clientListingId', 'listingId', 'externalId')
  const leadId = pick(body, 'leadId', 'id', 'ticketId')
  const origem = String(pick(body, 'leadOrigin') ?? 'Grupo OLX')

  // liga ao imóvel pelo código (clientListingId = código conhecido pelo portal)
  let produto: string | null = null
  if (clientListingId) {
    const { data: im } = await svc
      .from('imoveis')
      .select('titulo, codigo')
      .eq('empresa_id', empresa.id)
      .eq('codigo', String(clientListingId))
      .maybeSingle()
    if (im) produto = im.titulo || im.codigo
  }

  // roleta: define o corretor responsável
  const responsavel = await proximoResponsavel(svc, empresa.id)

  const detalhes = [
    email ? `E-mail: ${email}` : null,
    clientListingId ? `Imóvel/anúncio: ${clientListingId}` : null,
    mensagem ? `Mensagem: ${mensagem}` : null,
  ].filter(Boolean).join(' · ')

  const { data: lead, error } = await svc
    .from('leads')
    .insert({
      empresa_id: empresa.id,
      nome: String(nome),
      telefone: telefone ? String(telefone) : null,
      origem: 'grupo-olx',
      origem_id: leadId ? String(leadId) : null,
      kanban_status: 'novo',
      ativo: true,
      responsavel_id: responsavel,
      produto_interessado: produto,
      observacoes: `Lead ${origem}${detalhes ? ' · ' + detalhes : ''}`,
      msgs_nao_lidas: mensagem ? 1 : 0,
      primeira_msg: mensagem ? String(mensagem) : null,
      ultima_mensagem_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'Falha ao registrar lead' }, { status: 500 })
  }

  // registra a mensagem do lead (aparece no chat)
  if (mensagem) {
    await svc.from('lead_mensagens').insert({
      empresa_id: empresa.id,
      lead_id: lead.id,
      conteudo: String(mensagem),
      direcao: 'recebida',
      origem: 'grupo-olx',
      lida: false,
    })
  }

  return NextResponse.json({ ok: true, leadId: lead.id }, { status: 200 })
}
