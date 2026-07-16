import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'

// Upload de mídia do chat do lead (imagem/vídeo/áudio) para o bucket público
// chat-midia. O envio real ao canal acontece na Edge webhook-leads, que recebe
// a URL pública retornada aqui. Limites alinhados aos canais mais restritivos
// (WhatsApp: imagem 5MB, vídeo/áudio 16MB).
const LIMITES: Record<string, { max: number; tipoMidia: 'image' | 'video' | 'audio' }> = {
  image: { max: 5 * 1024 * 1024, tipoMidia: 'image' },
  video: { max: 16 * 1024 * 1024, tipoMidia: 'video' },
  audio: { max: 16 * 1024 * 1024, tipoMidia: 'audio' },
}

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/aac': 'aac', 'audio/wav': 'wav',
}

export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
  if (auth.error) return auth.error

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 })

  const mime = (file.type || '').split(';')[0].trim()
  const categoria = mime.split('/')[0]
  const limite = LIMITES[categoria]
  if (!limite || !EXT_POR_MIME[mime]) {
    return NextResponse.json({ error: 'Formato não suportado. Use imagem, vídeo ou áudio.' }, { status: 415 })
  }
  if (file.size > limite.max) {
    return NextResponse.json({ error: `Arquivo muito grande (máx. ${Math.round(limite.max / 1024 / 1024)}MB para ${categoria === 'image' ? 'imagem' : categoria === 'video' ? 'vídeo' : 'áudio'}).` }, { status: 413 })
  }

  const svc = createServiceClient()
  const path = `${auth.empresaId}/${crypto.randomUUID()}.${EXT_POR_MIME[mime]}`
  const buf = await file.arrayBuffer()
  const { error } = await svc.storage.from('chat-midia').upload(path, buf, { contentType: mime })
  if (error) {
    console.error('chat upload error:', error.message)
    return NextResponse.json({ error: 'Falha ao subir o arquivo. Tente novamente.' }, { status: 500 })
  }

  const { data } = svc.storage.from('chat-midia').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl, tipoMidia: limite.tipoMidia })
}
