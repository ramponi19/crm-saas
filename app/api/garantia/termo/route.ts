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
  const termoId = Number(form.get('termoId'))
  const arquivo = form.get('arquivo')

  if (!Number.isFinite(termoId) || termoId <= 0) return NextResponse.json({ error: 'Termo inválido' }, { status: 400 })
  if (!(arquivo instanceof File)) return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 })
  if (!TIPOS_OK.includes(arquivo.type)) {
    return NextResponse.json({ error: 'Envie um PDF ou uma imagem (JPG/PNG).' }, { status: 400 })
  }
  if (arquivo.size > TAMANHO_MAX) {
    return NextResponse.json({ error: 'Arquivo acima de 10 MB. Reduza a qualidade da digitalização.' }, { status: 400 })
  }

  // O termo tem de ser desta empresa. Sem isto, um id adivinhado anexaria
  // arquivo em venda de outra loja.
  const { data: termo } = await supabase
    .from('vendas_termos').select('id, venda_id, tipo, arquivo_url')
    .eq('id', termoId).eq('empresa_id', empresaId).maybeSingle()
  if (!termo) return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 })

  const ext = arquivo.type === 'application/pdf' ? 'pdf' : arquivo.type === 'image/png' ? 'png' : 'jpg'
  const caminho = `${empresaId}/termos/${termo.venda_id}-${termo.tipo}-${Date.now()}.${ext}`

  const { error: eUp } = await supabase.storage.from('documentos')
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (eUp) return NextResponse.json({ error: `Falha ao enviar: ${eUp.message}` }, { status: 400 })

  const { error: eTermo } = await supabase.from('vendas_termos').update({
    status: 'assinado',
    arquivo_url: caminho,
    assinado_em: new Date().toISOString(),
    assinado_por: user.id,
  } as never).eq('id', termoId).eq('empresa_id', empresaId)

  if (eTermo) {
    // Não deixa arquivo órfão ocupando espaço se o termo não pôde ser marcado.
    await supabase.storage.from('documentos').remove([caminho])
    return NextResponse.json({ error: eTermo.message }, { status: 400 })
  }

  // Substituição: remove o anterior só depois de o novo estar gravado.
  if (termo.arquivo_url && termo.arquivo_url !== caminho) {
    await supabase.storage.from('documentos').remove([termo.arquivo_url])
  }

  return NextResponse.json({ ok: true, caminho })
}

/** Link temporário para abrir o termo assinado. */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const empresaId = await getEmpresaId()
  const termoId = Number(req.nextUrl.searchParams.get('termoId'))
  if (!empresaId || !Number.isFinite(termoId)) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })

  const { data: termo } = await supabase
    .from('vendas_termos').select('arquivo_url')
    .eq('id', termoId).eq('empresa_id', empresaId).maybeSingle()
  if (!termo?.arquivo_url) return NextResponse.json({ error: 'Sem termo anexado' }, { status: 404 })

  // 10 minutos: tempo de abrir e mandar, sem virar link permanente circulando.
  const { data, error } = await supabase.storage.from('documentos')
    .createSignedUrl(termo.arquivo_url, 600)
  if (error || !data) return NextResponse.json({ error: 'Não foi possível gerar o link' }, { status: 400 })

  return NextResponse.json({ url: data.signedUrl })
}
