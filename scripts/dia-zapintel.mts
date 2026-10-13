/**
 * O PARÁGRAFO DO DIA — o briefing que a IA recebe e o texto que ela devolve.
 *
 * O parágrafo só presta se cada número dele estiver no briefing. Isso não se
 * verifica lendo o prompt: verifica-se imprimindo os dois lado a lado e
 * conferindo um por um. É o mesmo cuidado que matou três `TICKET_MEDIO = 5200`
 * — número na tela sem origem conhecida é invenção até prova em contrário.
 *
 *     npx tsx scripts/dia-zapintel.mts [empresaId]
 *
 * Lê o painel JÁ GUARDADO em `zapintel_painel`. Não recalcula nada e não grava
 * nada: o relato só é gravado pela rota, em produção.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { briefingDoDia, systemDoDia } from '../lib/zapintel/dia'
import { getRole, getSegment } from '../lib/zapintel/segments/segments'
import type { Painel } from '../lib/zapintel/painel'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const EMPRESA = Number(process.argv[2] ?? 1)

const { data } = await db
  .from('zapintel_painel').select('painel, ultima_mensagem, calculado_em, versao')
  .eq('empresa_id', EMPRESA).maybeSingle()

if (!data?.painel) {
  console.error(`empresa ${EMPRESA} nao tem painel guardado. Abra o ZapIntel e clique em Sincronizar.`)
  process.exit(1)
}

const painel = JSON.parse(data.painel as string) as Painel
const briefing = briefingDoDia(painel)
const seg = getSegment(painel.segmentId)
const system = systemDoDia(getRole(painel.segmentId), seg.description)

console.log(`\npainel de ${painel.empresaNome} · ${data.versao} · calculado ${data.calculado_em}`)
console.log(`segmento: ${painel.segmentId} (${seg.description})\n`)
console.log('═'.repeat(74))
console.log('O QUE A IA RECEBE (briefing)')
console.log('═'.repeat(74))
console.log(briefing)

console.log(`\n${'═'.repeat(74)}`)
console.log('A INSTRUÇÃO')
console.log('═'.repeat(74))
console.log(system)

const apiKey = env.GEMINI_API_KEY
if (!apiKey) {
  console.log('\n(sem GEMINI_API_KEY no .env.local — parei antes de chamar a IA)\n')
  process.exit(0)
}

const modelo = env.GEMINI_MODEL || 'gemini-2.5-flash'
const t0 = Date.now()
const r = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: `Os números de hoje:\n\n${briefing}` }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 400 },
    }),
  },
)
const j = await r.json()

console.log(`\n${'═'.repeat(74)}`)
console.log(`O QUE A IA DEVOLVE  (${modelo}, ${Date.now() - t0} ms)`)
console.log('═'.repeat(74))

if (!r.ok) {
  console.error(`HTTP ${r.status}:`, j?.error?.message ?? j)
  process.exit(1)
}

const texto = (j?.candidates?.[0]?.content?.parts ?? [])
  .map((p: { text?: string }) => p.text ?? '').join('').trim()
console.log(texto || '(vazio)')

const uso = j?.usageMetadata
console.log(`\ntokens: ${uso?.promptTokenCount} entrada · ${uso?.candidatesTokenCount} saida\n`)
