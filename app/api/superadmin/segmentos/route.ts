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
    /** Ordem do menu por grupo: { "Hoje": ["/dashboard", "/leads"], ... }. */
    menu_layout?: Record<string, string[]>
    ordem?: number; ativo?: boolean
  }
  if (!b.label?.trim()) return NextResponse.json({ error: 'Label obrigatório' }, { status: 400 })
  const chave = b.novo ? slugify(b.chave || b.label) : b.chave
  if (!chave) return NextResponse.json({ error: 'Chave inválida' }, { status: 400 })

  const svc = createServiceClient()

  /**
   * SALVAR É REMENDO, NÃO SUBSTITUIÇÃO.
   *
   * Antes o `row` trazia `?? []` em todo campo que a tela não manda — e a tela de
   * Segmentos manda apenas label, descrição, ordem, ativo, rótulos e módulos
   * ligados. Resultado: cada salvamento zerava `hidden_hrefs` e `modulos_extra`
   * em silêncio. Foi exatamente assim que a imobiliária ficou com
   * `modulos_extra = []` e perdeu "Metas e Ranking" do menu (achado em 20/08/2026).
   *
   * Agora campo ausente no corpo CONSERVA o que está no banco. Para limpar um
   * campo, a tela precisa mandá-lo explicitamente vazio — que é o que "salvar" deve
   * exigir de quem quer apagar configuração.
   */
  const { data: atual } = await svc.from('segmentos_config')
    .select('hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados, menu_layout, descricao, ordem, ativo')
    .eq('chave', chave).maybeSingle()

  const manter = <T,>(vindo: T | undefined, noBanco: unknown, vazio: T): T =>
    vindo !== undefined ? vindo : ((noBanco ?? vazio) as T)

  const row = {
    chave,
    label: b.label.trim(),
    descricao: b.descricao !== undefined ? (b.descricao?.trim() || null) : (atual?.descricao ?? null),
    hidden_hrefs: manter(b.hidden_hrefs, atual?.hidden_hrefs, [] as string[]) as never,
    label_overrides: manter(b.label_overrides, atual?.label_overrides, {} as Record<string, string>) as never,
    modulos_extra: manter(b.modulos_extra, atual?.modulos_extra, [] as { href: string; label: string; icon: string }[]) as never,
    modulos_habilitados: manter(b.modulos_habilitados, atual?.modulos_habilitados, [] as string[]) as never,
    menu_layout: manter(b.menu_layout, atual?.menu_layout, {} as Record<string, string[]>) as never,
    ordem: Number.isFinite(b.ordem) ? b.ordem! : (atual?.ordem ?? 0),
    ativo: b.ativo !== undefined ? b.ativo : (atual?.ativo ?? true),
  }

  const { error } = await svc.from('segmentos_config').upsert(row, { onConflict: 'chave' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSuperAdminAction({ adminUserId: auth.userId, acao: b.novo ? 'criar_segmento' : 'editar_segmento', detalhes: { chave } })
  return NextResponse.json({ ok: true, chave })
}
