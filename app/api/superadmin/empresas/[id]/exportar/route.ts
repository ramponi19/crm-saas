import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gerarExportacao, TABELAS_LGPD } from '@/lib/lgpd/exportacao'

// Lê a empresa inteira de mil em mil (as mensagens passam de 100 mil linhas).
export const maxDuration = 300

/**
 * GET — exportação LGPD da empresa (lib/lgpd/exportacao.ts): completa, só do core e
 * dos módulos, num ZIP no bucket privado `lgpd-exportacoes`, apagado em 24 h. Devolve
 * o link assinado de 10 minutos e a contagem de linhas de cada arquivo — não o ZIP:
 * a resposta da Vercel tem teto de 4,5 MB.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const db = createServiceClient() as unknown as SupabaseClient

  const { data: empresa } = await db.from('empresas').select('*, ...empresa_branding(wl_cor:cor, wl_logo_url:logo_url, wl_slogan:slogan, wl_whatsapp:whatsapp, wl_menu:sidebar), ...empresa_dados_contrato(representante_nome, representante_cpf, representante_nacionalidade, representante_estado_civil, representante_profissao, banco_nome, banco_agencia, banco_conta, banco_pix)').eq('id', empresaId).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

  const slug = ((empresa as { slug?: string }).slug ?? `empresa-${empresaId}`).replace(/[^a-z0-9-]/gi, '')
  let r
  try {
    r = await gerarExportacao(db, empresaId, empresa as Record<string, unknown>, slug)
  } catch (e) {
    // Exportação LGPD incompleta não pode sair como se estivesse completa.
    return NextResponse.json({ error: `Falha ao exportar: ${(e as Error).message}` }, { status: 500 })
  }

  await logSuperAdminAction({
    adminUserId: auth.userId,
    empresaId,
    acao: 'exportar_dados_lgpd',
    detalhes: { arquivos: TABELAS_LGPD.length + 3, bytes: r.bytes, contagens: r.contagens, caminho: r.caminho },
  })

  return NextResponse.json({ url: r.url, expiraEm: r.expiraEm, bytes: r.bytes, contagens: r.contagens })
}
