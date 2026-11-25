// RESGATE DE UMA MÍDIA DO WHATSAPP A PARTIR DO COFRE (historico_bruto, tipo 'midia_sem_arquivo').
//
// Quando a Edge não consegue gravar a mídia (ex.: Storage 520 em 25/11/2026, mensagem 363153), ela grava a
// mensagem como texto "[audio]" e guarda o pedido original no cofre. A Meta deixa baixar a mídia recebida por
// webhook por 7 DIAS (o cofre também guarda 7 dias). Este script faz, para UMA mensagem, o que a Edge faria:
//   cofre → id da mídia → Graph (URL de 5 min) → download → confere o sha256 do pedido → Storage → mensagem.
//
//   node --env-file="<.env.local da produção>" scripts/midia/resgatar-uma.mjs --mensagem 363153 --cofre 7963
//   ... --gravar     (sem isso é SIMULAÇÃO: baixa e confere, não grava nada)
//
// Gravando: guarda o backup da linha em --backup <arquivo.json> (obrigatório) ANTES de tocar em qualquer coisa,
// grava o arquivo no MESMO caminho determinístico da Edge (<empresa>/m/wa-<id>.<ext>) e só atualiza a mensagem
// que ainda está sem arquivo. Imprime a volta no fim.
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null }
const MSG = Number(arg('mensagem')), COFRE = Number(arg('cofre')), GRAVAR = process.argv.includes('--gravar')
const BACKUP = arg('backup')
if (!MSG || !COFRE) { console.error('uso: --mensagem <id> --cofre <id> [--gravar --backup <arquivo>]'); process.exit(1) }
if (GRAVAR && !BACKUP) { console.error('--gravar exige --backup <arquivo.json>'); process.exit(1) }

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const GRAPH = process.env.META_GRAPH_VERSION || 'v25.0'
if (!URL_SB || !SERVICE || !process.env.CHANNEL_ENCRYPTION_KEY) { console.error('faltam variáveis do .env.local'); process.exit(1) }
const db = createClient(URL_SB, SERVICE, { auth: { persistSession: false } })

// Mesma decifra de lib/canais/crypto.ts: base64(iv).base64(tag).base64(dados), AES-256-GCM.
function decifrar(cifrado) {
  const raw = process.env.CHANNEL_ENCRYPTION_KEY.trim()
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  const [iv, tag, dados] = cifrado.split('.')
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8')
}
// Mesmo mapa da Edge (EXT em webhook-leads/index.ts), só os tipos de áudio/imagem/vídeo/documento comuns.
const EXT = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'application/pdf': 'pdf' }
const TIPO = { audio: 'audio', image: 'imagem', video: 'video', sticker: 'imagem', document: 'documento' }

const falha = (m) => { console.error('PARADO:', m); process.exit(2) }

// 1. A mensagem e o pedido no cofre, e se casam.
const { data: msg } = await db.from('mensagens')
  .select('id, empresa_id, canal_id, tipo, conteudo, midia_url, external_id, created_at').eq('id', MSG).maybeSingle()
if (!msg) falha('mensagem não encontrada')
const { data: cofre } = await db.from('historico_bruto').select('id, empresa_id, canal_id, tipo, payload').eq('id', COFRE).maybeSingle()
if (!cofre || cofre.tipo !== 'midia_sem_arquivo') falha('item do cofre não encontrado ou de outro tipo')
const p = cofre.payload ?? {}
const tipoMeta = String(p.type ?? '')
const bloco = p[tipoMeta] ?? {}
if (p.id !== msg.external_id) falha('o pedido do cofre não é desta mensagem (external_id diferente)')
if (cofre.empresa_id !== msg.empresa_id || cofre.canal_id !== msg.canal_id) falha('empresa ou canal diferente entre cofre e mensagem')
if (msg.midia_url) falha('a mensagem já tem arquivo — nada a resgatar')
if (!bloco.id) falha('o pedido não traz o id da mídia')
console.log(`mensagem ${msg.id} · empresa ${msg.empresa_id} · canal ${msg.canal_id} · tipo atual "${msg.tipo}" · mídia ${tipoMeta} ${bloco.id}`)

// 2. Token do canal.
const { data: canal } = await db.from('canais').select('id, empresa_id, access_token_enc').eq('id', msg.canal_id).maybeSingle()
if (!canal?.access_token_enc) falha('canal sem token')
const token = decifrar(canal.access_token_enc)

// 3. Graph: URL nova (vale 5 min) e download.
const info = await fetch(`https://graph.facebook.com/${GRAPH}/${bloco.id}`, { headers: { Authorization: `Bearer ${token}` } })
const infoJson = await info.json().catch(() => ({}))
if (!info.ok || !infoJson.url) falha(`a Meta não devolveu a mídia (HTTP ${info.status}: ${infoJson?.error?.message ?? 'sem url'})`)
const res = await fetch(infoJson.url, { headers: { Authorization: `Bearer ${token}` } })
if (!res.ok) falha(`download falhou: HTTP ${res.status}`)
const buf = Buffer.from(await res.arrayBuffer())
const ct = (res.headers.get('content-type') ?? infoJson.mime_type ?? 'application/octet-stream').split(';')[0].trim()
const sha = crypto.createHash('sha256').update(buf).digest()
const confere = [sha.toString('base64'), sha.toString('hex')].includes(String(bloco.sha256 ?? infoJson.sha256 ?? ''))
console.log(`baixado: ${buf.length} bytes · ${ct} · sha256 confere com o pedido: ${confere ? 'SIM' : 'NÃO'}`)
if (!confere) falha('sha256 diferente do pedido original — não grava')

const ext = EXT[ct] ?? 'bin'
const caminho = `${msg.empresa_id}/m/${`wa-${bloco.id}`.replace(/[^A-Za-z0-9_-]/g, '').slice(-100)}.${ext}`
const tipoNovo = TIPO[tipoMeta] ?? msg.tipo
console.log(`destino: chat-midia/${caminho} · tipo da mensagem passa a "${tipoNovo}"`)
if (!GRAVAR) { console.log('SIMULAÇÃO: nada foi gravado. Rode com --gravar --backup <arquivo> para resgatar.'); process.exit(0) }

// 4. Backup da linha ANTES de tocar.
fs.writeFileSync(BACKUP, JSON.stringify({ quando: new Date().toISOString(), mensagem: msg, cofre_id: cofre.id, caminho }, null, 2))
console.log(`backup: ${BACKUP}`)

// 5. Storage (mesmo caminho da Edge, upsert) e mensagem (só se ainda sem arquivo).
const up = await db.storage.from('chat-midia').upload(caminho, buf, { contentType: ct, upsert: true })
if (up.error) falha(`upload: ${up.error.message}`)
const publica = db.storage.from('chat-midia').getPublicUrl(caminho).data.publicUrl
const { data: atual, error: errUpd } = await db.from('mensagens')
  .update({ tipo: tipoNovo, midia_url: publica }).eq('id', msg.id).is('midia_url', null).select('id, tipo, midia_url')
if (errUpd || !atual?.length) falha(`a mensagem não foi atualizada (${errUpd?.message ?? 'já tinha arquivo?'}); o arquivo ficou em ${caminho}`)
await db.from('historico_bruto').update({ processado_em: new Date().toISOString() }).eq('id', cofre.id)
console.log(`RESGATADO: mensagem ${msg.id} → ${tipoNovo} com arquivo.`)
console.log(`VOLTA: update mensagens set tipo='${msg.tipo}', midia_url=null where id=${msg.id};  e apagar chat-midia/${caminho}`)
