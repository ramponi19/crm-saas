/**
 * RETENÇÃO DE ÁUDIO — o som sai, o texto fica.
 *
 *     npx tsx scripts/reter-audio.mts                 (simula, não apaga nada)
 *     npx tsx scripts/reter-audio.mts --dias 7
 *     npx tsx scripts/reter-audio.mts --dias 7 --apagar
 *
 * ══ POR QUE ═══════════════════════════════════════════════════════════════
 *
 * Decisão do Lucas em 13/10/2026: *"prefiro ter o audio transcrito que pode
 * ser analisado futuramente do que um audio que ninguem vai ouvir ocupando
 * metade do espaco disponivel"*.
 *
 * Medido em 14/10/2026: o bucket `chat-midia` está em **940,9 MB de 1.024**.
 * Sobram 83 MB e ele cresce ~18 MB/dia — quatro dias. O áudio é 475,5 MB
 * disso, e **13.044 dos 13.046 já estão transcritos**: o conteúdo está salvo
 * em texto, que ocupa 2,4 MB no banco.
 *
 * ══ AS TRÊS REGRAS QUE TORNAM ISSO SEGURO ═════════════════════════════════
 *
 * 1. **Só apaga o que tem transcrição.** `transcricao IS NULL` significa
 *    "ainda não ouvi" — apagar esse arquivo perderia o conteúdo para sempre.
 *    String vazia é diferente: significa "ouvi e não havia fala", e aí o
 *    arquivo não guarda nada que o texto já não diga.
 *
 * 2. **A URL é limpa ANTES do arquivo ser apagado.** Se o processo morrer no
 *    meio, o pior resultado é um arquivo órfão — que uma varredura recolhe
 *    depois. Na ordem inversa, o pior resultado seria a tela apontando para
 *    um arquivo que não existe, ou seja, um player quebrado na frente do
 *    vendedor. Estado visível correto vale mais que bytes arrumados.
 *
 * 3. **Pela API do Storage, nunca por SQL.** Apagar a linha de
 *    `storage.objects` some com o registro e deixa o binário no S3: o espaço
 *    continua ocupado e ninguém mais sabe que ele existe.
 *
 * ══ A TELA JÁ ESTÁ PRONTA PARA ISSO ═══════════════════════════════════════
 *
 * `TranscricaoAudio` em `components/modules/leads/lead-modal.tsx` recebe
 * `audioGuardado={!!m.midiaUrl}`. Sem a URL, ela mostra "♪ TRANSCRIÇÃO
 * AUTOMÁTICA · áudio não guardado" e o texto continua lá. Nada a mudar.
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const BUCKET = 'chat-midia'
const arg = (n: string, p: number): number => {
  const i = process.argv.indexOf(n)
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN
  return Number.isFinite(v) ? v : p
}
const DIAS = arg('--dias', 7)
const APAGAR = process.argv.includes('--apagar')

/** O PostgREST entrega 1000 por vez, em silêncio. Terceira vez que isso morde
 *  este projeto — por isso o laço repergunta em vez de confiar no `limit`. */
async function todas(corte: string) {
  const fora: { id: number; nome: string; url: string }[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db
      .from('lead_mensagens')
      .select('id, midia_url, created_at')
      .eq('tipo', 'audio')
      .not('transcricao', 'is', null)
      .not('midia_url', 'is', null)
      .lt('created_at', corte)
      .order('id', { ascending: true })
      .range(de, de + 999)
    if (error) throw new Error(error.message)
    const linhas = (data ?? []) as { id: number; midia_url: string }[]
    for (const l of linhas) {
      const nome = l.midia_url.split('/chat-midia/')[1]
      if (nome) fora.push({ id: l.id, nome: decodeURIComponent(nome), url: l.midia_url })
    }
    if (linhas.length < 1000) break
  }
  return fora
}

const corte = new Date(Date.now() - DIAS * 86_400_000).toISOString()
console.log(`\nretencao de ${DIAS} dias — corte em ${corte.slice(0, 10)}`)

const alvos = await todas(corte)
if (!alvos.length) { console.log('\nnada a fazer.\n'); process.exit(0) }

console.log(`${alvos.length} audios transcritos com mais de ${DIAS} dias`)

if (!APAGAR) {
  console.log('\nSIMULACAO — nada foi apagado. Exemplos:')
  for (const a of alvos.slice(0, 5)) console.log(`  msg ${a.id}  ${a.nome}`)
  console.log(`\npara valer: npx tsx scripts/reter-audio.mts --dias ${DIAS} --apagar\n`)
  process.exit(0)
}

/**
 * ── 1. BACKUP, antes de tocar em qualquer coisa ─────────────────────────────
 *
 * Grava em `zapintel_audio_retido` o id da mensagem, o nome do arquivo e a URL
 * antiga. O arquivo em si não volta — mas saber EXATAMENTE o que saiu é o que
 * separa "a retenção rodou" de "sumiu áudio e ninguém sabe qual".
 *
 * No banco, e não num JSON na máquina do Lucas: este script vai virar rotina,
 * e rotina que deixa prova em pasta temporária não deixa prova nenhuma.
 */
const { error: errBk } = await db.from('zapintel_audio_retido').insert(
  alvos.map((a) => ({
    mensagem_id: a.id, arquivo: a.nome, url_antiga: a.url, dias_janela: DIAS,
  })) as never,
)
if (errBk) {
  console.error(`\nPAREI: nao consegui gravar o backup (${errBk.message}).`)
  console.error('Sem registro do que vai sair, nao apago nada.\n')
  process.exit(1)
}
console.log(`\nbackup gravado em zapintel_audio_retido (${alvos.length} linhas)`)

// ── 2. A URL SAI PRIMEIRO. Ver a regra 2 no cabeçalho. ──────────────────────
console.log('\nlimpando as URLs...')
let limpas = 0
for (let i = 0; i < alvos.length; i += 200) {
  const ids = alvos.slice(i, i + 200).map((a) => a.id)
  const { error } = await db.from('lead_mensagens')
    .update({ midia_url: null } as never).in('id', ids)
  if (error) { console.error(`  erro no lote ${i}: ${error.message}`); continue }
  limpas += ids.length
  if (limpas % 2000 === 0) console.log(`  ${limpas}/${alvos.length}`)
}
console.log(`${limpas} URLs limpas`)

// ── 3. OS ARQUIVOS, pela API do Storage ─────────────────────────────────────
console.log('\napagando os arquivos...')
let apagados = 0, falhas = 0
for (let i = 0; i < alvos.length; i += 100) {
  const nomes = alvos.slice(i, i + 100).map((a) => a.nome)
  const { error } = await db.storage.from(BUCKET).remove(nomes)
  if (error) { falhas += nomes.length; console.error(`  erro: ${error.message}`); continue }
  apagados += nomes.length
  if (apagados % 2000 === 0) console.log(`  ${apagados}/${alvos.length}`)
}

console.log(`\n${apagados} arquivos apagados, ${falhas} falhas.`)
console.log('O texto continua em `lead_mensagens.transcricao`.')
console.log('A tela passa a mostrar "transcricao automatica · audio nao guardado".\n')
