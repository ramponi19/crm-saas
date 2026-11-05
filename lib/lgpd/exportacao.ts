import type { SupabaseClient } from '@supabase/supabase-js'
import { criarZip, linhasParaCsv, type ZipEntry } from '@/lib/zip'
import { lerTodosOsClientes } from '@/lib/clientes'
import { leadDoNegocio } from '@/lib/leads'

/**
 * EXPORTAÇÃO LGPD DA EMPRESA (superadmin) — completa, no Storage, com link de 10 min.
 *
 * Até 05/11/2026 o ZIP voltava na própria resposta e cada tabela vinha de UMA leitura
 * do PostgREST: `leads` e `lead_mensagens` saíam cortadas em 1.000 linhas (3.120 e
 * 102.589 no banco), sem aviso. Paginar não bastava: a resposta passaria dos 4,5 MB
 * da Vercel. Agora:
 *   - cada tabela é lida INTEIRA, de mil em mil pelo id (keyset, não offset);
 *   - só tabelas do core e dos módulos — nada de view de compatibilidade:
 *     `leads.csv` é o negócio na forma de lead (lib/leads.ts), `mensagens.csv` é a
 *     tabela `mensagens`;
 *   - o ZIP (DEFLATE) vai para o bucket PRIVADO `lgpd-exportacoes`, e quem pediu
 *     recebe um link assinado de 10 minutos;
 *   - o arquivo é apagado em até 25 h (`limparExportacoes`, job de hora em hora pelo
 *     pg_cron, e também a cada exportação nova).
 * Leitura que falha derruba a exportação inteira: exportação incompleta não pode sair
 * como se estivesse completa.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>
type Linha = Record<string, unknown>

export const BUCKET_LGPD = 'lgpd-exportacoes'
const VALIDADE_LINK_S = 600
const VIDA_ARQUIVO_MS = 24 * 3600 * 1000

/** Tabelas exportadas como estão (todas com `id` e `empresa_id`). */
export const TABELAS_LGPD = [
  'empresa_usuarios', 'contatos', 'contato_identidades', 'negocios', 'negocio_historico', 'conversas', 'mensagens',
  'tarefas', 'visitas', 'vendas_vendas', 'vendas_comissoes', 'estoque_produtos', 'imoveis_imoveis',
  'financeiro_cobrancas', 'financeiro_lancamentos',
] as const

/** Todas as linhas da empresa, de mil em mil pelo id (o teto do PostgREST é mil por resposta). */
export async function lerTudo(db: Db, tabela: string, empresaId: number, colunas = '*'): Promise<Linha[]> {
  const out: Linha[] = []
  let depois = 0
  for (;;) {
    const { data, error } = await db.from(tabela).select(colunas).eq('empresa_id', empresaId)
      .gt('id', depois).order('id', { ascending: true }).limit(1000)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    const lote = (data ?? []) as unknown as Linha[]
    out.push(...lote)
    if (lote.length < 1000) return out
    depois = Number(lote[lote.length - 1].id)
  }
}

export interface ResultadoExportacao {
  caminho: string
  url: string
  expiraEm: string
  bytes: number
  contagens: Record<string, number>
}

/** Gera o ZIP, grava no bucket privado e devolve o link assinado de 10 minutos. */
export async function gerarExportacao(svc: Db, empresaId: number, empresa: Linha, slug: string): Promise<ResultadoExportacao> {
  await limparExportacoes(svc).catch(() => undefined)

  const entries: ZipEntry[] = [{ nome: 'empresa.csv', conteudo: linhasParaCsv([empresa]) }]
  const contagens: Record<string, number> = {}

  const clientes = await lerTodosOsClientes(svc, empresaId)
  contagens.clientes = clientes.length
  entries.push({ nome: 'clientes.csv', conteudo: linhasParaCsv(clientes as unknown as Linha[]) })

  const lidas: Record<string, Linha[]> = {}
  for (const tabela of TABELAS_LGPD) {
    lidas[tabela] = await lerTudo(svc, tabela, empresaId)
    contagens[tabela] = lidas[tabela].length
    entries.push({ nome: `${tabela}.csv`, conteudo: linhasParaCsv(lidas[tabela]) })
  }

  // leads.csv: o negócio na forma de sempre (nome, telefone, etapa...), montado do que já foi lido.
  const contatos = new Map(lidas.contatos.map((c) => [c.id as number, c]))
  const etapas = new Map((await lerTudo(svc, 'funil_etapas', empresaId, 'id, slug')).map((e) => [e.id as number, e]))
  const leads = lidas.negocios.map((n) => {
    const l = leadDoNegocio({ ...n, contato: contatos.get(n.contato_id as number) ?? null, etapa: etapas.get(n.etapa_id as number) ?? null })
    return { ...l } as unknown as Linha
  })
  contagens.leads = leads.length
  entries.push({ nome: 'leads.csv', conteudo: linhasParaCsv(leads) })

  const zip = criarZip(entries)
  const hoje = new Date().toISOString().slice(0, 10)
  const caminho = `lgpd-${empresaId}-${slug}-${hoje}-${Date.now()}.zip`
  const { error: eUp } = await svc.storage.from(BUCKET_LGPD).upload(caminho, zip, { contentType: 'application/zip', upsert: false })
  if (eUp) throw new Error(`gravar o ZIP no Storage: ${eUp.message}`)
  const { data: link, error: eLink } = await svc.storage.from(BUCKET_LGPD)
    .createSignedUrl(caminho, VALIDADE_LINK_S, { download: `lgpd-${slug}-${hoje}.zip` })
  if (eLink || !link) throw new Error(`link assinado: ${eLink?.message ?? 'sem link'}`)
  return {
    caminho, url: link.signedUrl, bytes: zip.length, contagens,
    expiraEm: new Date(Date.now() + VALIDADE_LINK_S * 1000).toISOString(),
  }
}

/** Apaga do bucket os ZIPs com mais de 24 h. Devolve quantos saíram. */
export async function limparExportacoes(svc: Db, agora = Date.now()): Promise<number> {
  const { data, error } = await svc.storage.from(BUCKET_LGPD).list('', { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } })
  if (error) throw new Error(`listar exportações: ${error.message}`)
  const velhos = (data ?? [])
    .filter((o) => o.name?.endsWith('.zip') && o.created_at && agora - new Date(o.created_at).getTime() > VIDA_ARQUIVO_MS)
    .map((o) => o.name)
  if (!velhos.length) return 0
  const { error: eDel } = await svc.storage.from(BUCKET_LGPD).remove(velhos)
  if (eDel) throw new Error(`apagar exportações: ${eDel.message}`)
  return velhos.length
}
