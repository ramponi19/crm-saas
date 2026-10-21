/**
 * O CONTRATO SAI IGUAL QUANDO A FONTE DOS DADOS DA LOJA TROCA (Frente 1, item 1.4).
 *
 *   TESTE_URL=http://localhost:54323 TESTE_ANON=<anon> TESTE_JWTS="dono=<jwt>,vendedor=<jwt>" \
 *     npx tsx scripts/comparar-contrato.mts <pasta-de-saida> <id-do-contrato>...
 *
 * Contra a cópia (nunca produção). Para cada contrato arquivado, remonta a
 * entrada da emissão a partir do que ficou gravado (itens, total, pagamento,
 * vendedor, data...) e EMITE de novo pela lib/contrato-emitir.ts — com a sessão
 * de cada pessoa em TESTE_JWTS, porque o vendedor emite no PDV e a RLS conta.
 * Grava o HTML de cada emissão e o da 2ª via (o arquivado, reimpresso).
 *
 * Rodar uma vez com o código e o banco ANTES da migração e outra DEPOIS, em
 * pastas diferentes, e comparar byte a byte (cmp/fc). Emitir de novo grava mais
 * uma linha em contratos_venda na cópia — por isso os ids vêm na linha de
 * comando, e não "os últimos".
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { emitirContrato, contratosDaVenda, type EmitirContratoInput } from '../lib/contrato-emitir'

const [saida, ...ids] = process.argv.slice(2)
const url = process.env.TESTE_URL
const anon = process.env.TESTE_ANON
const jwts = (process.env.TESTE_JWTS ?? '').split(',').filter(Boolean).map((p) => p.split('=') as [string, string])
if (!saida || !ids.length || !url || !anon || !jwts.length) {
  console.error('uso: TESTE_URL=... TESTE_ANON=... TESTE_JWTS="nome=jwt,..." npx tsx scripts/comparar-contrato.mts <saida> <id>...')
  process.exit(2)
}
if (!/localhost|127\.0\.0\.1/.test(url)) { console.error('só contra a cópia local'); process.exit(2) }
fs.mkdirSync(saida, { recursive: true })

const cliente = (jwt: string) => createClient(url, anon, {
  global: { headers: { Authorization: `Bearer ${jwt}` } },
  auth: { persistSession: false, autoRefreshToken: false },
})

type Arquivado = {
  id: number; empresa_id: number; cliente_id: number | null; venda_ids: number[]; documento_id: number
  nome_documento: string | null; dados: Record<string, unknown>
}

for (const id of ids) {
  const leitor = cliente(jwts[0][1])
  const { data, error } = await leitor.from('contratos_venda')
    .select('id, empresa_id, cliente_id, venda_ids, documento_id, nome_documento, dados').eq('id', Number(id)).maybeSingle()
  if (error || !data) { console.error(`contrato ${id}: ${error?.message ?? 'não encontrado'}`); process.exitCode = 1; continue }
  const c = data as Arquivado
  const d = c.dados as {
    itens: EmitirContratoInput['itens']; trocas?: EmitirContratoInput['trocas']; total: number; desconto?: number
    forma_pagamento: string | null; parcelas?: number | null; vendedor?: string | null; data?: string
  }
  const input: EmitirContratoInput = {
    empresaId: c.empresa_id, documentoId: c.documento_id, nomeDocumento: c.nome_documento ?? 'Contrato',
    clienteId: c.cliente_id, vendaIds: c.venda_ids, itens: d.itens, trocas: d.trocas, total: d.total,
    desconto: d.desconto, forma_pagamento: d.forma_pagamento, parcelas: d.parcelas, vendedor: d.vendedor, data: d.data,
  }
  for (const [quem, jwt] of jwts) {
    const db = cliente(jwt)
    const r = await emitirContrato(db, input)
    fs.writeFileSync(path.join(saida, `${id}-${quem}-emissao.html`), r.html ?? `SEM HTML ${JSON.stringify({ semModelo: r.semModelo, bloqueado: r.bloqueado })}`)
    const segundas = await contratosDaVenda(db, c.venda_ids[0])
    const original = segundas.find((s) => s.id === c.id)
    fs.writeFileSync(path.join(saida, `${id}-${quem}-2via.html`), original?.html ?? 'SEM 2a VIA')
    console.log(`contrato ${id} · ${quem}: emissão ${r.html?.length ?? 0} bytes, faltandoLoja=${JSON.stringify(r.faltandoLoja ?? [])}, 2ª via ${original?.html.length ?? 0} bytes`)
  }
}
