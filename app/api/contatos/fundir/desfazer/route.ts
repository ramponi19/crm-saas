import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { desfazerFusao } from '@/lib/fusao-contatos'

/**
 * DESFAZER UMA FUSÃO DE CONTATOS (03/11/2026). Só dono e admin.
 *
 * Usa a foto que a fusão guardou no próprio registro (lib/fusao-contatos.ts):
 * recria o contato que saiu com o mesmo id, devolve conversas, mensagens,
 * negócios, identidades e o resto, e marca o registro como desfeito (com quem
 * desfez) + evento `contato.fusao_desfeita`.
 *
 *   POST { fusaoId }
 */
export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const b = (await req.json().catch(() => null)) as { fusaoId?: unknown } | null
  const fusaoId = Number(b?.fusaoId)
  if (!Number.isInteger(fusaoId) || fusaoId <= 0) return NextResponse.json({ error: 'Fusão inválida' }, { status: 400 })

  const r = await desfazerFusao(createServiceClient(), auth.empresaId, fusaoId, auth.userId)
  if (r.error) return NextResponse.json({ error: r.error, voltou: r.voltou }, { status: r.status ?? 500 })
  return NextResponse.json({ ok: true, contato: r.contato, voltou: r.voltou })
}
