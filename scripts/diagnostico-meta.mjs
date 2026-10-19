// Diagnóstico READ-ONLY dos canais Meta (WhatsApp Cloud / Instagram / Messenger).
//
// Para que serve: dizer, em 5 segundos, se cada canal de cada tenant tem token válido,
// qual página/número está por trás dele e quais campos de webhook estão assinados.
// Rodar SEMPRE antes e depois de mexer em canal.
//
//   node scripts/diagnostico-meta.mjs
//
// Fonte: canais_conectados (o que o chat e o envio usam). O token vem cifrado
// (access_token_enc) e é decifrado aqui com CHANNEL_ENCRYPTION_KEY, no mesmo formato
// de lib/canais/crypto.ts. configuracoes_sistema não guarda mais canal nem token.
//
// Nunca imprime o token — só tamanho e 4 últimos caracteres, para conferir se mudou.
// Não escreve nada: só GET na Graph API e SELECT no banco.
import { readFileSync } from 'node:fs'
import { createDecipheriv } from 'node:crypto'

const GRAPH = process.env.META_GRAPH_VERSION || 'v25.0'

function carregarEnv() {
  const env = { ...process.env }
  for (const arquivo of ['.env.local', '.env']) {
    try {
      for (const linha of readFileSync(new URL(`../${arquivo}`, import.meta.url), 'utf8').split(/\r?\n/)) {
        const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
        if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    } catch { /* arquivo ausente é ok */ }
  }
  return env
}

const env = carregarEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || !env.CHANNEL_ENCRYPTION_KEY) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / CHANNEL_ENCRYPTION_KEY (.env.local).')
  process.exit(1)
}

function decifrar(cifrado) {
  const raw = env.CHANNEL_ENCRYPTION_KEY.trim()
  const chave = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  const [iv, tag, dados] = String(cifrado).split('.')
  const d = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8')
}

const mask = (t) => (t ? `${t.length} chars …${t.slice(-4)}` : 'AUSENTE')
const graph = async (path, host = 'graph.facebook.com') => {
  const r = await fetch(`https://${host}/${GRAPH}/${path}`)
  return { ok: r.ok, status: r.status, body: await r.json() }
}
const erro = (b) => `code ${b.error?.code}/${b.error?.error_subcode ?? '-'} · ${b.error?.message}`

const res = await fetch(
  `${url}/rest/v1/canais_conectados?select=id,empresa_id,filial_id,tipo,via,status,external_id,waba_id,access_token_enc&order=empresa_id,id`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
)
const rows = await res.json()
if (!Array.isArray(rows)) {
  console.error('Erro lendo canais_conectados:', JSON.stringify(rows).slice(0, 300))
  process.exit(1)
}
if (!rows.length) {
  console.log('Nenhum canal Meta conectado.')
  process.exit(0)
}

console.log(`Graph ${GRAPH} · ${rows.length} canal(is)\n${'─'.repeat(70)}`)
let falhas = 0

for (const row of rows) {
  let token = null
  try { token = row.access_token_enc ? decifrar(row.access_token_enc) : null } catch { token = null }
  console.log(`\n▸ canal ${row.id} ${row.tipo}/${row.via}  (empresa ${row.empresa_id}, loja ${row.filial_id ?? '-'})  status=${row.status}  token: ${mask(token)}`)
  if (!token) { falhas++; console.log('  ⚠️  sem token (ou não decifrou) — canal não envia nem identifica remetente'); continue }

  if (row.tipo === 'whatsapp') {
    const num = await graph(`${row.external_id}?fields=display_phone_number,verified_name,quality_rating&access_token=${token}`)
    if (num.ok) {
      console.log(`  ✅ token válido · número ${num.body.display_phone_number} (${num.body.verified_name}) · qualidade ${num.body.quality_rating ?? 'n/d'}`)
    } else {
      falhas++
      console.log(`  ❌ token inválido · ${erro(num.body)}`)
      if (num.body.error?.code === 190) console.log('     → 190 = reconectar o canal (token de sessão humana morre; usar System User)')
    }
    if (row.waba_id) {
      const sub = await graph(`${row.waba_id}/subscribed_apps?access_token=${token}`)
      if (sub.ok) {
        const apps = (sub.body.data ?? []).map((a) => a.whatsapp_business_api_data?.name ?? a.name ?? a.id)
        console.log(`  webhook da WABA: ${apps.length ? apps.join(', ') : '⚠️ NENHUM app assinado — o número não entrega evento'}`)
      } else console.log(`  webhook da WABA: erro · ${erro(sub.body)}`)
    } else console.log('  ⚠️  sem waba_id salvo — não dá para assinar/checar o webhook')
    continue
  }

  // Instagram pelo login do Instagram: outra plataforma (graph.instagram.com), sem página.
  if (row.via === 'instagram') {
    const ig = await graph(`me?fields=user_id,username&access_token=${token}`, 'graph.instagram.com')
    if (ig.ok) console.log(`  ✅ token válido · @${ig.body.username} (${ig.body.user_id})`)
    else { falhas++; console.log(`  ❌ token inválido · ${erro(ig.body)}`) }
    continue
  }

  // Instagram / Messenger pela Página do Facebook: token de Página
  const me = await graph(`me?fields=id,name&access_token=${token}`)
  // Token de página sem pages_read_engagement não lê o próprio nome (#100), mas
  // continua mandando e recebendo mensagem: a validade se confere pelo debug_token.
  if (!me.ok && me.body.error?.code === 100 && env.META_APP_ID && env.META_APP_SECRET) {
    const dbg = await graph(`debug_token?input_token=${token}&access_token=${env.META_APP_ID}|${env.META_APP_SECRET}`)
    const d = dbg.body.data ?? {}
    if (d.is_valid) {
      console.log(`  ✅ token válido (debug_token) · tipo ${d.type} · página ${d.profile_id ?? row.external_id} · sem permissão para ler o nome`)
      continue
    }
  }
  if (!me.ok) {
    falhas++
    console.log(`  ❌ token inválido · ${erro(me.body)}`)
    if (me.body.error?.code === 190) console.log('     → 190 = reconsentimento necessário (re-rodar login do tenant)')
    continue
  }
  console.log(`  ✅ token válido · página "${me.body.name}" (${me.body.id})${row.external_id && row.external_id !== me.body.id ? ` ⚠️ external_id salvo divergente: ${row.external_id}` : ''}`)

  const sub = await graph(`${row.external_id || me.body.id}/subscribed_apps?access_token=${token}`)
  if (sub.ok) {
    const campos = (sub.body.data ?? []).flatMap((a) => a.subscribed_fields ?? [])
    console.log(`  webhook da página: ${campos.length ? campos.join(' | ') : '⚠️ NENHUM app assinado'}`)
    if (campos.length && !campos.includes('messages')) console.log('     ⚠️ falta "messages" — não recebe mensagem nova')
    if (row.tipo === 'messenger' && campos.length && !campos.includes('message_echoes')) {
      console.log('     ⚠️ falta "message_echoes" — mensagem enviada pelo app do Messenger não aparece no CRM')
    }
  } else console.log(`  webhook da página: erro · ${erro(sub.body)}`)
}

console.log(`\n${'─'.repeat(70)}`)
console.log(falhas ? `⚠️  ${falhas} canal(is) com problema — ver acima.` : '✅ Todos os canais com token válido.')
console.log('(read-only: nada foi alterado)')
