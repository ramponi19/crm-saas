// Mostra o que o app está REALMENTE assinado a receber, direto da Meta.
// Precisa de META_APP_ID + META_APP_SECRET (gera um token de aplicativo).
// Read-only. Rodar depois de mexer em webhook no painel — vale mais que print.
//
//   node scripts/diagnostico-webhooks.mjs
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
const APP_ID = E.META_APP_ID
const SECRET = E.META_APP_SECRET
const V = E.META_GRAPH_VERSION || 'v25.0'
if (!APP_ID || !SECRET) {
  console.error('Faltam META_APP_ID / META_APP_SECRET. No Vercel eles existem; localmente ponha no .env.local.')
  process.exit(1)
}

// O que cada canal precisa ter assinado para o CRM funcionar por completo.
const EXIGIDO = {
  whatsapp_business_account: {
    // NÃO existe campo "statuses" para assinar: a confirmação de entrega chega
    // dentro deste mesmo campo, com um bloco `statuses` no lugar de `messages`.
    messages: 'mensagem do cliente E confirmação de enviada/entregue/lida/falhou',
    smb_message_echoes: 'mensagem que o vendedor manda pelo app do celular (coexistência)',
    smb_app_state_sync: 'contatos da agenda do celular',
    history: 'histórico de 6 meses na conexão',
    account_update: 'desconexão / religação do canal',
  },
  page: {
    messages: 'mensagem no Messenger',
    message_echoes: 'mensagem enviada pelo app do Messenger',
    message_deliveries: 'confirmação de entrega',
    message_reads: 'confirmação de leitura',
  },
  instagram: {
    messages: 'mensagem no Instagram Direct (o echo vem dentro deste campo)',
  },
}

const tk = await fetch(`https://graph.facebook.com/${V}/oauth/access_token?client_id=${APP_ID}&client_secret=${SECRET}&grant_type=client_credentials`)
  .then((r) => r.json())
if (!tk.access_token) { console.error('App Secret recusado:', tk.error?.message); process.exit(1) }

const subs = await fetch(`https://graph.facebook.com/${V}/${APP_ID}/subscriptions?access_token=${tk.access_token}`)
  .then((r) => r.json())
if (subs.error) { console.error('Erro lendo assinaturas:', subs.error.message); process.exit(1) }

const porObjeto = {}
for (const s of subs.data ?? []) {
  porObjeto[s.object] = {
    callback: s.callback_url,
    ativo: s.active,
    campos: (s.fields ?? []).map((f) => (typeof f === 'string' ? f : f.name)),
  }
}

let faltando = 0
for (const [objeto, exigidos] of Object.entries(EXIGIDO)) {
  const atual = porObjeto[objeto]
  console.log(`\n▸ ${objeto}`)
  if (!atual) {
    console.log('  ❌ SEM ASSINATURA — este canal não entrega evento nenhum')
    faltando += Object.keys(exigidos).length
    continue
  }
  console.log(`  callback: ${atual.callback ?? '?'} · ativo: ${atual.ativo ? 'sim' : 'NÃO'}`)
  for (const [campo, para] of Object.entries(exigidos)) {
    const tem = atual.campos.includes(campo)
    if (!tem) faltando++
    console.log(`  ${tem ? '✅' : '❌'} ${campo.padEnd(20)} ${para}`)
  }
  const extras = atual.campos.filter((c) => !(c in exigidos))
  if (extras.length) console.log(`  (também assinado, sem uso hoje: ${extras.join(', ')})`)
}

const objetosSobrando = Object.keys(porObjeto).filter((o) => !(o in EXIGIDO))
if (objetosSobrando.length) console.log(`\n(outros objetos assinados: ${objetosSobrando.join(', ')})`)

console.log(faltando ? `\n⚠️  ${faltando} campo(s) faltando — ver os ❌ acima.` : '\n✅ Todos os campos necessários estão assinados.')
