import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'

// Abre um arquivo do bucket privado chat-midia (mídia e avatar do chat).
// Só para quem está logado, e só arquivo da pasta da própria empresa
// (`<empresa_id>/...`, o formato que o upload e a webhook-leads gravam).
// Responde com redirect para uma URL assinada de 600 s gerada aqui, nunca
// com a URL pública (que, com o bucket privado, não abre). Ver lib/storage/midia.ts.
const VALIDADE_S = 600
const CACHE_S = 480

export async function GET(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
  if (auth.error) return auth.error

  const caminho = new URL(req.url).searchParams.get('p') ?? ''
  const naoAchou = NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  if (!caminho.startsWith(`${auth.empresaId}/`) || caminho.includes('..') || caminho.length > 300) return naoAchou

  const { data, error } = await createServiceClient().storage.from('chat-midia').createSignedUrl(caminho, VALIDADE_S)
  if (error || !data?.signedUrl) return naoAchou

  const res = NextResponse.redirect(data.signedUrl, 302)
  // O navegador guarda o redirect por 8 min (21/10/2026): reabrir a conversa não
  // sobe a função de novo — antes era `no-store` e cada redesenho do chat pedia
  // de novo, ~125 ms de CPU por arquivo. 8 < 10 min da assinatura: o redirect
  // guardado nunca aponta para uma URL vencida. `private` = só o navegador de
  // quem pediu guarda; a CDN da Vercel não (a resposta depende da sessão).
  res.headers.set('Cache-Control', `private, max-age=${CACHE_S}`)
  return res
}
