/**
 * A CAMADA DE CLIENTES LÊ O MESMO QUE A VIEW `clientes` (lote 8 das views, 05/11/2026).
 *
 *   TESTE_URL=http://127.0.0.1:54321 TESTE_SERVICE=<service_role> \
 *     node --import ./tests/alias.mjs scripts/comparar-clientes.mts
 *
 * Só contra o banco local, com a view ainda de pé e a 20261105001000 aplicada (os campos
 * copiados para dados). Para cada empresa, lê a view inteira e `lerTodosOsClientes`
 * (lib/clientes.ts) e compara coluna a coluna. Tipo e origem do cliente saem
 * normalizados da camada ("novo" → "Novo", "loja_fisica" → "Loja física"): a
 * comparação normaliza o lado da view igual. Sai com 1 se qualquer campo divergir.
 */
import { createClient } from '@supabase/supabase-js'
import { lerTodosOsClientes, type Cliente } from '../lib/clientes'

const url = process.env.TESTE_URL, chave = process.env.TESTE_SERVICE
if (!url || !chave) { console.error('uso: TESTE_URL=... TESTE_SERVICE=... node --import ./tests/alias.mjs scripts/comparar-clientes.mts'); process.exit(2) }
if (!/localhost|127\.0\.0\.1/.test(url)) { console.error('só contra o banco local'); process.exit(2) }
const db = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } })

const TIPO: Record<string, string> = { novo: 'Novo', ativo: 'Ativo', vip: 'VIP', recorrente: 'Recorrente', inativo: 'Inativo' }
const normaliza = (k: string, v: unknown): unknown => {
  if (v === undefined) return null
  if (k === 'tipo_cliente' && typeof v === 'string') return TIPO[v.toLowerCase()] ?? v
  if (k === 'origem_cliente' && v === 'loja_fisica') return 'Loja física'
  if (k === 'valor_pretendido' && v != null) return Number(v)
  if (k === 'created_at' && v != null) return new Date(String(v)).toISOString()
  return v
}

const { data: empresas } = await db.from('empresas').select('id')
let linhas = 0, divergencias = 0
for (const { id: empresaId } of (empresas ?? []) as { id: number }[]) {
  const view: Record<string, unknown>[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('clientes').select('*').eq('empresa_id', empresaId).order('id').range(de, de + 999)
    if (error) { console.error(`view, empresa ${empresaId}: ${error.message}`); process.exit(1) }
    view.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const camada = new Map((await lerTodosOsClientes(db, empresaId)).map((c) => [c.id, c]))
  if (camada.size !== view.length) { console.log(`empresa ${empresaId}: view ${view.length} × camada ${camada.size}`); divergencias++ }
  for (const v of view) {
    linhas++
    const c = camada.get(v.id as number)
    if (!c) { console.log(`cliente ${v.id}: falta na camada`); divergencias++; continue }
    for (const k of Object.keys(v)) {
      const a = normaliza(k, v[k]), b = normaliza(k, c[k as keyof Cliente])
      if (JSON.stringify(a) !== JSON.stringify(b)) { console.log(`cliente ${v.id}.${k}: view ${JSON.stringify(v[k])} × camada ${JSON.stringify(b)}`); divergencias++ }
    }
  }
}
console.log(`${linhas} clientes comparados, ${divergencias} divergência(s)`)
process.exit(divergencias ? 1 : 0)
