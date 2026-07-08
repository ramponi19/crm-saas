import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { criarZip, linhasParaCsv, type ZipEntry } from '@/lib/zip'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// Tabelas com dados pessoais do tenant, exportadas para o ZIP LGPD.
const TABELAS = [
  'empresa_usuarios', 'leads', 'lead_mensagens', 'clientes', 'vendas',
  'produtos', 'imoveis', 'proprietarios', 'visitas', 'tarefas',
  'cobrancas', 'lancamentos_financeiros', 'comissoes',
]

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const svc = createServiceClient()
  const db = svc as unknown as SupabaseClient

  const { data: empresa } = await db.from('empresas').select('*').eq('id', empresaId).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

  const entries: ZipEntry[] = []
  entries.push({ nome: 'empresa.csv', conteudo: linhasParaCsv([empresa as Record<string, unknown>]) })

  for (const tabela of TABELAS) {
    const { data } = await db.from(tabela).select('*').eq('empresa_id', empresaId)
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    entries.push({ nome: `${tabela}.csv`, conteudo: linhasParaCsv(rows) })
  }

  const zip = criarZip(entries)

  await logSuperAdminAction({
    adminUserId: auth.userId,
    empresaId,
    acao: 'exportar_dados_lgpd',
    detalhes: { tabelas: TABELAS.length + 1 },
  })

  const slug = (empresa as { slug?: string }).slug ?? `empresa-${empresaId}`
  const hoje = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="lgpd-${slug}-${hoje}.zip"`,
    },
  })
}
