import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'

/**
 * Anexa o termo de garantia ASSINADO a uma venda (POST) ou devolve um link
 * temporário para abrir o arquivo (GET).
 *
 * O bucket é privado: o termo tem nome, CPF, endereço e a assinatura do cliente.
 * O acesso sai por URL assinada com prazo curto, gerada no servidor — link
 * público de documento assinado é vazamento esperando acontecer.
 */

const TIPOS_OK = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
const TAMANHO_MAX = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const form = await req.formData()
  const vendaId = Number(form.get('vendaId'))
  const arquivo = form.get('arquivo')

  if (!Number.isFinite(vendaId) || vendaId <= 0) return NextResponse.json({ error: 'Venda inválida' }, { status: 400 })
  if (!(arquivo instanceof File)) return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 })
  if (!TIPOS_OK.includes(arquivo.type)) {
    return NextResponse.json({ error: 'Envie um PDF ou uma imagem (JPG/PNG).' }, { status: 400 })
  }
  if (arquivo.size > TAMANHO_MAX) {
    return NextResponse.json({ error: 'Arquivo acima de 10 MB. Reduza a qualidade da digitalização.' }, { status: 400 })
  }

  // A venda tem de ser desta empresa E estar esperando termo. Sem isto, um id
  // adivinhado anexaria arquivo em venda de outra loja.
  const { data: venda } = await supabase
    .from('vendas').select('id, termo_garantia, termo_garantia_url')
    .eq('id', vendaId).eq('empresa_id', empresaId).maybeSingle()
  if (!venda) return NextResponse.json({ error: 'Venda não encontrada' }, { status: 404 })
  if (!venda.termo_garantia) return NextResponse.json({ error: 'Esta venda não pede termo de garantia.' }, { status: 400 })

  const ext = arquivo.type === 'application/pdf' ? 'pdf' : arquivo.type === 'image/png' ? 'png' : 'jpg'
  const caminho = `${empresaId}/termos/${vendaId}-${Date.now()}.${ext}`

  const { error: eUp } = await supabase.storage.from('documentos')
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (eUp) return NextResponse.json({ error: `Falha ao enviar: ${eUp.message}` }, { status: 400 })

  const { error: eVenda } = await supabase.from('vendas').update({
    termo_garantia: 'assinado',
    termo_garantia_url: caminho,
    termo_garantia_em: new Date().toISOString(),
    termo_garantia_por: user.id,
  } as never).eq('id', vendaId).eq('empresa_id', empresaId)

  if (eVenda) {
    // Não deixa arquivo órfão ocupando espaço se a venda não pôde ser marcada.
    await supabase.storage.from('documentos').remove([caminho])
    return NextResponse.json({ error: eVenda.message }, { status: 400 })
  }

  // Substituição: remove o anterior só depois de o novo estar gravado.
  if (venda.termo_garantia_url && venda.termo_garantia_url !== caminho) {
    await supabase.storage.from('documentos').remove([venda.termo_garantia_url])
  }

  return NextResponse.json({ ok: true, caminho })
}

/** Link temporário para abrir o termo assinado. */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  const vendaId = Number(req.nextUrl.searchParams.get('vendaId'))
  if (!empresaId || !Number.isFinite(vendaId)) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })

  const { data: venda } = await supabase
    .from('vendas').select('termo_garantia_url')
    .eq('id', vendaId).eq('empresa_id', empresaId).maybeSingle()
  if (!venda?.termo_garantia_url) return NextResponse.json({ error: 'Sem termo anexado' }, { status: 404 })

  // 10 minutos: tempo de abrir e mandar, sem virar link permanente circulando.
  const { data, error } = await supabase.storage.from('documentos')
    .createSignedUrl(venda.termo_garantia_url, 600)
  if (error || !data) return NextResponse.json({ error: 'Não foi possível gerar o link' }, { status: 400 })

  return NextResponse.json({ url: data.signedUrl })
}
