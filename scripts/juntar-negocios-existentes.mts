/**
 * Junta os negócios ativos repetidos (mesmo contato, loja e funil) que já existem —
 * a mesma rotina da fusão (lib/juntar-negocios.ts), com origem 'correcao'.
 *
 *   npx tsx scripts/juntar-negocios-existentes.mts --listar            só mostra (padrão)
 *   npx tsx scripts/juntar-negocios-existentes.mts --aplicar 837 38    junta estes contatos
 *
 * Antes de aplicar, grava em dumps/<data>-juncao/ a foto JSON de cada contato: os
 * negócios e todas as linhas que apontam para eles. Cada junção vira um evento
 * `negocio.juntado` (desfazer: desfazerJuncao(evento)). Lê .env.local (PRODUÇÃO).
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { juntarNegociosDoContato, planoDeJuncao, TABELAS_DO_NEGOCIO } from '../lib/juntar-negocios'

process.loadEnvFile('.env.local')
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const EMPRESA = Number(process.env.EMPRESA ?? 1)
const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const contatos = args.filter((a) => /^\d+$/.test(a)).map(Number)

type N = { id: number; contato_id: number; filial_id: number | null; funil_id: number | null; etapa_id: number | null; created_at: string; status: string; dados: Record<string, unknown> | null }
async function negociosAtivos(contato?: number): Promise<N[]> {
  let q = svc.from('negocios').select('id, contato_id, filial_id, funil_id, etapa_id, created_at, status, dados').eq('empresa_id', EMPRESA).eq('ativo', true)
  if (contato) q = q.eq('contato_id', contato)
  const out: N[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q.order('id').range(de, de + 999)
    if (error) throw error
    out.push(...(data as N[]))
    if ((data ?? []).length < 1000) return out
  }
}

const todos = await negociosAtivos()
const { data: ets } = await svc.from('funil_etapas').select('id, ordem, label').eq('empresa_id', EMPRESA)
const etapa = new Map(((ets ?? []) as { id: number; ordem: number | null; label: string }[]).map((e) => [e.id, e]))
const porContato = new Map<number, N[]>()
for (const n of todos) porContato.set(n.contato_id, [...(porContato.get(n.contato_id) ?? []), n])
const casos = [...porContato.entries()].map(([c, ns]) => ({ c, plano: planoDeJuncao(ns.map((n) => ({ ...n, ordem: n.etapa_id ? (etapa.get(n.etapa_id)?.ordem ?? null) : null }))) }))
  .filter((x) => x.plano.length)
for (const { c, plano } of casos) {
  for (const p of plano) console.log(`contato ${c}: fica #${p.fica.id} (${etapa.get(p.fica.etapa_id ?? 0)?.label ?? '?'}, ${p.fica.status}) · saem ${p.saem.map((s) => `#${s.id} (${etapa.get(s.etapa_id ?? 0)?.label ?? '?'}, ${s.status})`).join(', ')}`)
}
console.log(`${casos.length} contato(s) com negócio repetido.`)
if (!aplicar) process.exit(0)

const alvo = casos.filter((x) => contatos.includes(x.c))
if (!alvo.length || alvo.length !== contatos.length) { console.error('Informe os contatos da lista acima (todos precisam estar nela).'); process.exit(1) }
const pasta = `dumps/${new Date().toISOString().slice(0, 10)}-juncao`
mkdirSync(pasta, { recursive: true })
for (const { c } of alvo) {
  const negs = await negociosAtivos(c)
  const ids = negs.map((n) => n.id)
  const ligacoes: Record<string, unknown[]> = {}
  for (const t of [...TABELAS_DO_NEGOCIO, { tabela: 'cadencia_inscricoes', coluna: 'lead_id' }, { tabela: 'cadencia_inscricoes', coluna: 'negocio_id' },
    { tabela: 'automacao_execucoes', coluna: 'negocio_id' }, { tabela: 'imoveis_perfis_busca', coluna: 'lead_id' }]) {
    const { data, error } = await svc.from(t.tabela).select('*').in(t.coluna, ids)
    if (error) throw new Error(`${t.tabela}: ${error.message}`)
    if (data?.length) ligacoes[`${t.tabela}.${t.coluna}`] = data
  }
  writeFileSync(`${pasta}/contato-${c}.json`, JSON.stringify({ em: new Date().toISOString(), negocios: negs, ligacoes }, null, 1))
  const r = await juntarNegociosDoContato(svc, EMPRESA, c, { userId: null, origem: 'correcao' })
  console.log(`contato ${c}:`, r.error ? `ERRO ${r.error}` : r.juncoes.map((j) => `#${j.sai} → #${j.fica} (evento ${j.evento})`).join(', '))
}
console.log(`foto antes em ${pasta}/`)
