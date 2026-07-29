// Troca o endereço do webhook de um objeto da Meta entre a função de PRODUÇÃO e a
// de PREVIEW. Serve para testar a Edge nova com tráfego real e voltar em segundos.
//
//   node scripts/apontar-webhook.mjs instagram preview
//   node scripts/apontar-webhook.mjs instagram producao
//   node scripts/apontar-webhook.mjs             (só mostra onde cada objeto aponta)
//
// Objetos: instagram | page (Messenger) | whatsapp_business_account
//
// A Meta valida o endereço novo com o handshake ANTES de aceitar, então uma URL
// que não responda certo é recusada na hora — não fica meio-configurada.
// Credenciais vêm do .env.local (ignorado pelo git).
import { readFileSync } from 'node:fs'

function env() {
  const e = { ...process.env }
  for (const arq of ['.env.local', '.env']) {
    try {
      for (const l of readFileSync(new URL(`../${arq}`, import.meta.url), 'utf8').split(/\r?\n/)) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
        if (m && !e[m[1]]) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    } catch {}
  }
  return e
}

const E = env()
const V = E.META_GRAPH_VERSION || 'v25.0'
const BASE = 'https://guiuzbcqkvelqcuogxtd.supabase.co/functions/v1'
const URLS = { producao: `${BASE}/webhook-leads`, preview: `${BASE}/webhook-leads-preview` }
const [objeto, destino] = process.argv.slice(2)

if (!E.META_APP_ID || !E.META_APP_SECRET) {
  console.error('Faltam META_APP_ID / META_APP_SECRET no .env.local')
  process.exit(1)
}

const appToken = await fetch(
  `https://graph.facebook.com/${V}/oauth/access_token?client_id=${E.META_APP_ID}&client_secret=${E.META_APP_SECRET}&grant_type=client_credentials`,
).then((r) => r.json()).then((j) => j.access_token)
if (!appToken) { console.error('App Secret recusado pela Meta'); process.exit(1) }

const ler = async () => (await fetch(`https://graph.facebook.com/${V}/${E.META_APP_ID}/subscriptions?access_token=${appToken}`).then((r) => r.json())).data ?? []
const qual = (url) => (url === URLS.preview ? 'PREVIEW' : url === URLS.producao ? 'produção' : url)

// Sem argumentos: só mostra o estado atual.
if (!objeto || !destino) {
  console.log('Onde cada objeto aponta hoje:\n')
  for (const s of await ler()) {
    const campos = (s.fields ?? []).map((f) => (typeof f === 'string' ? f : f.name))
    console.log(`  ${String(s.object).padEnd(26)} ${qual(s.callback_url)}`)
    console.log(`  ${''.padEnd(26)} campos: ${campos.join(', ')}\n`)
  }
  console.log('Para trocar: node scripts/apontar-webhook.mjs <objeto> <preview|producao>')
  process.exit(0)
}

if (!URLS[destino]) { console.error('destino deve ser "preview" ou "producao"'); process.exit(1) }

const atual = (await ler()).find((s) => s.object === objeto)
if (!atual) { console.error(`objeto "${objeto}" não está assinado neste app`); process.exit(1) }

// Preserva exatamente os campos já assinados — trocar o endereço não pode
// desassinar nada.
const campos = (atual.fields ?? []).map((f) => (typeof f === 'string' ? f : f.name))
console.log(`antes:  ${qual(atual.callback_url)}`)
console.log(`campos: ${campos.join(', ')}`)

const r = await fetch(`https://graph.facebook.com/${V}/${E.META_APP_ID}/subscriptions?access_token=${appToken}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    object: objeto,
    callback_url: URLS[destino],
    verify_token: E.WEBHOOK_VERIFY_TOKEN ?? '',
    fields: campos.join(','),
    include_values: 'true',
  }),
})
const j = await r.json()
if (!r.ok || !j.success) { console.error('FALHOU:', j.error?.message ?? JSON.stringify(j)); process.exit(1) }

const novo = (await ler()).find((s) => s.object === objeto)
const camposDepois = (novo?.fields ?? []).map((f) => (typeof f === 'string' ? f : f.name))
console.log(`depois: ${qual(novo?.callback_url)}`)
console.log(`campos: ${camposDepois.join(', ')}`)

const camposOk = campos.length === camposDepois.length && campos.every((c) => camposDepois.includes(c))
if (novo?.callback_url === URLS[destino] && camposOk) {
  console.log(`\n✅ ${objeto} agora aponta para ${destino.toUpperCase()} (campos preservados)`)
} else {
  console.log('\n⚠️ confira acima: endereço ou campos não ficaram como esperado')
  process.exit(1)
}
