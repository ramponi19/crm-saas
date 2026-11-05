import { requireSuperAdminApi, logSuperAdminAction } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { criarZip, linhasParaCsv, type ZipEntry } from '@/lib/zip'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { lerTodosOsClientes } from '@/lib/clientes'

// Tabelas com dados pessoais do tenant, exportadas para o ZIP LGPD.
// Nomes do core (04/11/2026): as views antigas `cobrancas`, `lancamentos_financeiros` e
// `comissoes` saíram do banco, e o CSV delas vinha VAZIO sem aviso; `vendas`, `produtos` e
// `imoveis` são views no caminho da mesma saída. `proprietarios` nunca existiu como tabela
// (sempre exportou vazio) e saiu. `leads` e `lead_mensagens` trocam de fonte no último
// lote das views. `clientes.csv` (05/11/2026) sai da camada de clientes (lib/clientes.ts),
// na forma de sempre e sem o teto de mil linhas.
const TABELAS = [
  'empresa_usuarios', 'leads', 'lead_mensagens', 'vendas_vendas',
  'estoque_produtos', 'imoveis_imoveis', 'visitas', 'tarefas',
  'financeiro_cobrancas', 'financeiro_lancamentos', 'vendas_comissoes',
]

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi()
  if (auth.error) return auth.error

  const { id } = await params
  const empresaId = Number(id)
  if (!Number.isFinite(empresaId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const svc = createServiceClient()
  const db = svc as unknown as SupabaseClient

  const { data: empresa } = await db.from('empresas').select('*, ...empresa_branding(wl_cor:cor, wl_logo_url:logo_url, wl_slogan:slogan, wl_whatsapp:whatsapp, wl_menu:sidebar), ...empresa_dados_contrato(representante_nome, representante_cpf, representante_nacionalidade, representante_estado_civil, representante_profissao, banco_nome, banco_agencia, banco_conta, banco_pix)').eq('id', empresaId).maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

  const entries: ZipEntry[] = []
  entries.push({ nome: 'empresa.csv', conteudo: linhasParaCsv([empresa as Record<string, unknown>]) })

  try {
    const clientes = await lerTodosOsClientes(db, empresaId)
    entries.push({ nome: 'clientes.csv', conteudo: linhasParaCsv(clientes as unknown as Record<string, unknown>[]) })
  } catch (e) {
    return NextResponse.json({ error: `Falha ao exportar clientes: ${(e as Error).message}` }, { status: 500 })
  }

  for (const tabela of TABELAS) {
    const { data, error } = await db.from(tabela).select('*').eq('empresa_id', empresaId)
    // Exportação LGPD incompleta não pode sair como se estivesse completa.
    if (error) return NextResponse.json({ error: `Falha ao exportar ${tabela}: ${error.message}` }, { status: 500 })
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    entries.push({ nome: `${tabela}.csv`, conteudo: linhasParaCsv(rows) })
  }

  const zip = criarZip(entries)

  await logSuperAdminAction({
    adminUserId: auth.userId,
    empresaId,
    acao: 'exportar_dados_lgpd',
    detalhes: { tabelas: TABELAS.length + 2 },
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
