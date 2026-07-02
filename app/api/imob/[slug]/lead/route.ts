import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPortalToken } from '@/lib/portal-token'
import { proximoResponsavel } from '@/lib/roleta'

/**
 * Captura de leads do SITE PRÓPRIO da imobiliária.
 * O formulário do site (em outro domínio) faz POST aqui — por isso CORS liberado.
 * Cria o lead (origem 'site'), liga ao imóvel por código e distribui pela roleta.
 * Autenticado por token (mesmo token dos portais). Isolado da integração Meta.
 *
 * URL: /api/imob/{slug}/lead?token={token}
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const token = new URL(req.url).searchParams.get('token')
  const svc = createServiceClient()

  const { data: empresa } = await svc.from('empresas').select('id').eq('slug', slug).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404, headers: CORS })

  const esperado = await getPortalToken(svc, empresa.id)
  if (!esperado || token !== esperado) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401, headers: CORS })
  }

  // aceita JSON ou formulário (application/x-www-form-urlencoded / multipart)
  let body: Record<string, unknown> = {}
  const ct = req.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) {
      body = await req.json()
    } else {
      const fd = await req.formData()
      body = Object.fromEntries(Array.from(fd.entries()).map(([k, v]) => [k, typeof v === 'string' ? v : '']))
    }
  } catch { body = {} }

  const s = (v: unknown) => (v == null ? '' : String(v)).trim()
  const nome = s(body.nome || body.name) || 'Lead do site'
  const telefone = s(body.telefone || body.phone || body.whatsapp || body.celular) || null
  const email = s(body.email) || null
  const mensagem = s(body.mensagem || body.message || body.msg) || null
  const imovelCodigo = s(body.imovel || body.codigo || body.clientListingId) || null

  let produto: string | null = null
  if (imovelCodigo) {
    const { data: im } = await svc.from('imoveis')
      .select('titulo, codigo').eq('empresa_id', empresa.id).eq('codigo', imovelCodigo).maybeSingle()
    if (im) produto = im.titulo || im.codigo
  }

  const responsavel = await proximoResponsavel(svc, empresa.id)
  const detalhes = [email ? `E-mail: ${email}` : null, imovelCodigo ? `Imóvel: ${imovelCodigo}` : null, mensagem ? `Mensagem: ${mensagem}` : null].filter(Boolean).join(' · ')

  const { data: lead, error } = await svc.from('leads').insert({
    empresa_id: empresa.id,
    nome, telefone,
    origem: 'site',
    kanban_status: 'novo',
    ativo: true,
    responsavel_id: responsavel,
    produto_interessado: produto,
    observacoes: `Lead do site${detalhes ? ' · ' + detalhes : ''}`,
    msgs_nao_lidas: mensagem ? 1 : 0,
    primeira_msg: mensagem,
    ultima_mensagem_at: new Date().toISOString(),
  }).select('id').single()

  if (error || !lead) return NextResponse.json({ error: 'Falha ao registrar lead' }, { status: 500, headers: CORS })

  if (mensagem) {
    await svc.from('lead_mensagens').insert({
      empresa_id: empresa.id, lead_id: lead.id, conteudo: mensagem, direcao: 'recebida', origem: 'site', lida: false,
    })
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: CORS })
}
