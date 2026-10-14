/**
 * PROVA QUE A RETENÇÃO NÃO ALCANÇA O QUE NÃO DEVE.
 *
 *     npx tsx scripts/provar-retencao.mts
 *
 * ══ POR QUE ISTO EXISTE ════════════════════════════════════════════════════
 *
 * Pergunta do Lucas em 14/10/2026, depois de a retenção entrar: *"as fotos do
 * perfil do instagram nao vai sair nao ne?! a cada 7 dias"*.
 *
 * A pergunta é a certa, porque a rotina roda TODO DIA: um furo aqui não é um
 * acidente, é uma perda contínua. E quase aconteceu — a primeira versão da
 * view `storage_orfaos` marcou os 454 avatares como lixo, porque olhava só
 * `lead_mensagens.midia_url` e esquecia `leads.foto_url`.
 *
 * Ler o código não resolve essa dúvida: resolve rodar. Este script roda a
 * retenção inteira com **janela de ZERO dias** — o pior caso concebível, em
 * que tudo que existe está vencido — e confere que nenhum avatar aparece em
 * nenhum dos caminhos.
 *
 * ⚠ RODE ISTO antes de mexer em `lib/storage/retencao.ts`, na view
 * `storage_orfaos`, ou sempre que uma coluna nova passar a guardar mídia.
 *
 * Em 14/10/2026: 2.124 alvos na janela de zero dias, 0 avatares.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { aptosParaRetirada, acharOrfaos, TIPOS_RETIDOS } from '../lib/storage/retencao'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

/**
 * O que a retenção não pode tocar, NUNCA, em nenhuma janela.
 *
 * Hoje só os avatares. Quando outra pasta guardar coisa que não é anexo de
 * conversa, o nome dela entra aqui junto com a coluna que a aponta na view.
 */
const INTOCAVEIS = ['avatares']

console.log('\nrodando a retencao com JANELA DE ZERO DIAS (tudo vencido)\n')

let total = 0
const achados: string[] = []

for (const tipo of TIPOS_RETIDOS) {
  const alvos = await aptosParaRetirada(db, tipo, 0)
  const maus = alvos.filter((a) => INTOCAVEIS.some((p) => a.arquivo.includes(p)))
  total += alvos.length
  achados.push(...maus.map((a) => `${tipo}: ${a.arquivo}`))
  console.log(`  ${tipo.padEnd(7)} ${String(alvos.length).padStart(5)} alvos · ${maus.length} intocaveis`)
}

const orfaos = await acharOrfaos(db)
const orfMaus = orfaos.filter((n) => INTOCAVEIS.some((p) => n.includes(p)))
achados.push(...orfMaus.map((n) => `orfao: ${n}`))
console.log(`  orfaos  ${String(orfaos.length).padStart(5)} alvos · ${orfMaus.length} intocaveis`)

console.log(`\n${total + orfaos.length} alvos no total`)

if (achados.length) {
  console.error(`\nFALHOU — ${achados.length} arquivos intocaveis entraram na retencao:`)
  for (const a of achados.slice(0, 10)) console.error(`  ${a}`)
  console.error('\nConfira `leads.foto_url` na view `storage_orfaos` e os tipos em `lead_mensagens`.\n')
  process.exit(1)
}

console.log('OK — nenhum arquivo intocavel alcancado por nenhum caminho.\n')
