/**
 * RETENÇÃO DE ÁUDIO, à mão — o som sai, o texto fica.
 *
 *     npx tsx scripts/reter-audio.mts                 (simula, não apaga nada)
 *     npx tsx scripts/reter-audio.mts --dias 7
 *     npx tsx scripts/reter-audio.mts --dias 7 --apagar
 *
 * ══ POR QUE EXISTE, SE JÁ HÁ UM CRON ═══════════════════════════════════════
 *
 * O cron (`/api/cron/reter-audio`, 04h20) tira o que completou a janela, todo
 * dia, com teto de 2.000 por rodada. Serve para manter.
 *
 * Este script serve para os dois casos que o cron não cobre: a primeira
 * passada, que em 14/10/2026 tirou 11.078 arquivos e 412,9 MB de uma vez; e
 * mudar a janela depois — rodar com `--dias 15` e ver quanto sairia antes de
 * decidir.
 *
 * A REGRA MORA NUM LUGAR SÓ: `lib/storage/retencao-audio.ts`. Este arquivo é
 * só a linha de comando. Duas implementações da mesma regra divergiriam na
 * primeira mudança, e aqui divergir significa apagar o que não devia.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { aptosParaRetirada, retirarAudio, DIAS_PADRAO } from '../lib/storage/retencao-audio'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const i = process.argv.indexOf('--dias')
const DIAS = i >= 0 && Number.isFinite(Number(process.argv[i + 1])) ? Number(process.argv[i + 1]) : DIAS_PADRAO
const APAGAR = process.argv.includes('--apagar')

const corte = new Date(Date.now() - DIAS * 86_400_000)
console.log(`\nretencao de ${DIAS} dias — corte em ${corte.toISOString().slice(0, 10)}`)

const alvos = await aptosParaRetirada(db, DIAS)
console.log(`${alvos.length} audios transcritos com mais de ${DIAS} dias`)

if (!alvos.length) { console.log('\nnada a fazer.\n'); process.exit(0) }

if (!APAGAR) {
  console.log('\nSIMULACAO — nada foi apagado. Exemplos:')
  for (const a of alvos.slice(0, 5)) console.log(`  msg ${a.mensagemId}  ${a.arquivo}`)
  console.log(`\npara valer: npx tsx scripts/reter-audio.mts --dias ${DIAS} --apagar\n`)
  process.exit(0)
}

console.log('\napagando...')
const r = await retirarAudio(db, alvos, DIAS)
console.log(`\n${r.arquivosApagados} arquivos apagados · ${r.urlsLimpas} URLs limpas · ${r.falhas} falhas`)
console.log('O texto continua em `lead_mensagens.transcricao`.')
console.log('A tela mostra "transcricao automatica · audio nao guardado".\n')
