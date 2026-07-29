// Diagnóstico READ-ONLY dos canais Meta (WhatsApp Cloud / Instagram / Messenger).
//
// Para que serve: dizer, em 5 segundos, se cada canal de cada tenant tem token válido,
// qual página/número está por trás dele e quais campos de webhook estão assinados.
// Rodar SEMPRE antes e depois de mexer em canal.
//
//   node scripts/diagnostico-meta.mjs
//
// Nunca imprime o token — só tamanho e 4 últimos caracteres, para conferir se mudou.
// Não escreve nada: só GET na Graph API e SELECT no banco.
import { readFileSync } from 'node:fs'

const GRAPH = process.env.META_GRAPH_VERSION || 'v25.0'
const CHAVES = ['whatsapp_official', 'instagram', 'messenger', 'meta_instagram', 'meta_messenger']

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
if (!url || !key) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local).')
  process.exit(1)
}

const mask = (t) => (t ? `${t.length} chars …${t.slice(-4)}` : 'AUSENTE')
const graph = async (path) => {
  const r = await fetch(`https://graph.facebook.com/${GRAPH}/${path}`)
  return { ok: r.ok, status: r.status, body: await r.json() }
}
const erro = (b) => `code ${b.error?.code}/${b.error?.error_subcode ?? '-'} · ${b.error?.message}`

const res = await fetch(
  `${url}/rest/v1/configuracoes_sistema?chave=in.(${CHAVES.join(',')})&select=chave,valor,empresa_id&order=empresa_id`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
)
const rows = await res.json()
if (!Array.isArray(rows)) {
  console.error('Erro lendo configuracoes_sistema:', JSON.stringify(rows).slice(0, 300))
  process.exit(1)
}
if (!rows.length) {
  console.log('Nenhum canal Meta configurado.')
  process.exit(0)
}

console.log(`Graph ${GRAPH} · ${rows.length} config(s) de canal\n${'─'.repeat(70)}`)
let falhas = 0

for (const row of rows) {
  const v = row.valor || {}
  const token = v.token || v.page_token || v.access_token
  console.log(`\n▸ ${row.chave}  (empresa ${row.empresa_id})  ativo=${v.ativo}  token: ${mask(token)}`)
  if (!token) { falhas++; console.log('  ⚠️  sem token — canal não envia nem identifica remetente'); continue }

  if (row.chave === 'whatsapp_official') {
    const num = await graph(`${v.phone_number_id}?fields=display_phone_number,verified_name,quality_rating&access_token=${token}`)
    if (num.ok) {
      console.log(`  ✅ token válido · número ${num.body.display_phone_number} (${num.body.verified_name}) · qualidade ${num.body.quality_rating ?? 'n/d'}`)
    } else {
      falhas++
      console.log(`  ❌ token inválido · ${erro(num.body)}`)
      if (num.body.error?.code === 190) console.log('     → 190 = reconectar o canal (token de sessão humana morre; usar System User)')
    }
    if (v.waba_id) {
      const sub = await graph(`${v.waba_id}/subscribed_apps?access_token=${token}`)
      if (sub.ok) {
        const apps = (sub.body.data ?? []).map((a) => a.whatsapp_business_api_data?.name ?? a.name ?? a.id)
        console.log(`  webhook da WABA: ${apps.length ? apps.join(', ') : '⚠️ NENHUM app assinado — o número não entrega evento'}`)
      } else console.log(`  webhook da WABA: erro · ${erro(sub.body)}`)
    } else console.log('  ⚠️  sem waba_id salvo — não dá para assinar/checar o webhook')
    continue
  }

  // Instagram / Messenger: token de Página
  const me = await graph(`me?fields=id,name&access_token=${token}`)
  if (!me.ok) {
    falhas++
    console.log(`  ❌ token inválido · ${erro(me.body)}`)
    if (me.body.error?.code === 190) console.log('     → 190 = reconsentimento necessário (re-rodar login do tenant)')
    continue
  }
  console.log(`  ✅ token válido · página "${me.body.name}" (${me.body.id})${v.page_id && v.page_id !== me.body.id ? ` ⚠️ page_id salvo divergente: ${v.page_id}` : ''}`)

  const sub = await graph(`${v.page_id || me.body.id}/subscribed_apps?access_token=${token}`)
  if (sub.ok) {
    const campos = (sub.body.data ?? []).flatMap((a) => a.subscribed_fields ?? [])
    console.log(`  webhook da página: ${campos.length ? campos.join(' | ') : '⚠️ NENHUM app assinado'}`)
    if (campos.length && !campos.includes('messages')) console.log('     ⚠️ falta "messages" — não recebe mensagem nova')
    if (row.chave.includes('messenger') && campos.length && !campos.includes('message_echoes')) {
      console.log('     ⚠️ falta "message_echoes" — mensagem enviada pelo app do Messenger não aparece no CRM')
    }
  } else console.log(`  webhook da página: erro · ${erro(sub.body)}`)
}

console.log(`\n${'─'.repeat(70)}`)
console.log(falhas ? `⚠️  ${falhas} canal(is) com problema — ver acima.` : '✅ Todos os canais com token válido.')
console.log('(read-only: nada foi alterado)')
