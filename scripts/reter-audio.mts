/**
 * RETENÇÃO DE MÍDIA, à mão — o arquivo sai, o que dá para guardar em texto fica.
 *
 *     npx tsx scripts/reter-audio.mts                     (simula tudo)
 *     npx tsx scripts/reter-audio.mts --dias 7
 *     npx tsx scripts/reter-audio.mts --tipo video
 *     npx tsx scripts/reter-audio.mts --dias 7 --apagar
 *
 * ══ POR QUE EXISTE, SE JÁ HÁ UM CRON ═══════════════════════════════════════
 *
 * O cron (`/api/cron/reter-audio`, 04h20) tira o que completou a janela, todo
 * dia, com teto de 2.000 por rodada. Serve para manter.
 *
 * Este script serve para os dois casos que o cron não cobre: a primeira
 * passada, que em 14/10/2026 tirou 11.078 áudios e 412,9 MB de uma vez; e
 * mudar a janela depois — rodar com `--dias 15` e ver quanto sairia antes de
 * decidir qualquer coisa.
 *
 * A REGRA MORA NUM LUGAR SÓ: `lib/storage/retencao.ts`. Este arquivo é só a
 * linha de comando. Duas implementações da mesma regra divergiriam na
 * primeira mudança, e aqui divergir significa apagar o que não devia.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  aptosParaRetirada, retirarMidia, DIAS_PADRAO, TIPOS_RETIDOS,
  acharOrfaos, apagarOrfaos,
  type Retirada, type TipoRetido,
} from '../lib/storage/retencao'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const texto = (n: string): string | null => {
  const i = process.argv.indexOf(n)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const d = Number(texto('--dias'))
const DIAS = Number.isFinite(d) && d > 0 ? d : DIAS_PADRAO
const APAGAR = process.argv.includes('--apagar')
const SO = texto('--tipo') as TipoRetido | null
const TIPOS = SO ? [SO] : [...TIPOS_RETIDOS]

/**
 * ARQUIVO SEM NENHUMA MENSAGEM APONTANDO PARA ELE.
 *
 * Eram 540 numa hora so em 13/10/2026, quando o webhook baixava a midia do
 * historico ANTES de saber se havia mensagem para prende-la — causa corrigida
 * na Edge Function v62. O que sobra agora sao ~10 por dia, de download que
 * falha no meio: 454 arquivos e 3,8 MB em 14/10.
 *
 * Pouco espaco, mas lixo que ninguem recolhe vira lixo que ninguem ve.
 */
if (process.argv.includes('--orfaos')) {
  console.log('\nprocurando arquivos sem mensagem...')
  const orfaos = await acharOrfaos(db)
  console.log(`${orfaos.length} orfaos`)
  if (!orfaos.length || !APAGAR) {
    for (const n of orfaos.slice(0, 5)) console.log(`  ${n}`)
    if (orfaos.length) console.log('\npara valer: npx tsx scripts/reter-audio.mts --orfaos --apagar\n')
    process.exit(0)
  }
  const r = await apagarOrfaos(db, orfaos)
  console.log(`${r.apagados} apagados, ${r.falhas} falhas\n`)
  process.exit(0)
}

const corte = new Date(Date.now() - DIAS * 86_400_000)
console.log(`\nretencao de ${DIAS} dias — corte em ${corte.toISOString().slice(0, 10)}`)
console.log(`tipos: ${TIPOS.join(', ')}  (documento nunca sai)\n`)

const porTipo = new Map<string, Retirada[]>()
for (const t of TIPOS) {
  const alvos = await aptosParaRetirada(db, t, DIAS)
  porTipo.set(t, alvos)
  console.log(`  ${t.padEnd(8)} ${String(alvos.length).padStart(6)} arquivos`)
}

const todos = [...porTipo.values()].flat()
if (!todos.length) { console.log('\nnada a fazer.\n'); process.exit(0) }

if (!APAGAR) {
  console.log(`\nSIMULACAO — ${todos.length} arquivos, nada apagado. Exemplos:`)
  for (const a of todos.slice(0, 5)) console.log(`  [${a.tipo}] msg ${a.mensagemId}  ${a.arquivo}`)
  console.log(`\npara valer: npx tsx scripts/reter-audio.mts --dias ${DIAS} --apagar\n`)
  process.exit(0)
}

console.log('\napagando...')
let apagados = 0, falhas = 0
for (const [t, alvos] of porTipo) {
  if (!alvos.length) continue
  const r = await retirarMidia(db, alvos, DIAS)
  apagados += r.arquivosApagados
  falhas += r.falhas
  console.log(`  ${t.padEnd(8)} ${r.arquivosApagados} apagados, ${r.falhas} falhas`)
}

console.log(`\n${apagados} arquivos apagados, ${falhas} falhas.`)
console.log('A tela passa a dizer que a midia foi retirada, com a data.\n')
