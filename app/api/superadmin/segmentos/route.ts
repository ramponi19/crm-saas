import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

export async function POST(req: Request) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const b = await req.json().catch(() => ({})) as {
    chave?: string; novo?: boolean; label?: string; descricao?: string | null
    hidden_hrefs?: string[]; label_overrides?: Record<string, string>
    modulos_extra?: { href: string; label: string; icon: string }[]
    modulos_habilitados?: string[]
    ordem?: number; ativo?: boolean
  }
  if (!b.label?.trim()) return NextResponse.json({ error: 'Label obrigatório' }, { status: 400 })
  const chave = b.novo ? slugify(b.chave || b.label) : b.chave
  if (!chave) return NextResponse.json({ error: 'Chave inválida' }, { status: 400 })

  const row = {
    chave,
    label: b.label.trim(),
    descricao: b.descricao?.trim() || null,
    hidden_hrefs: (b.hidden_hrefs ?? []) as never,
    label_overrides: (b.label_overrides ?? {}) as never,
    modulos_extra: (b.modulos_extra ?? []) as never,
    modulos_habilitados: (b.modulos_habilitados ?? []) as never,
    ordem: Number.isFinite(b.ordem) ? b.ordem! : 0,
    ativo: b.ativo ?? true,
  }

  const svc = createServiceClient()
  const { error } = await svc.from('segmentos_config').upsert(row, { onConflict: 'chave' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({ adminUserId: auth.userId, acao: b.novo ? 'criar_segmento' : 'editar_segmento', detalhes: { chave } })
  return NextResponse.json({ ok: true, chave })
}
