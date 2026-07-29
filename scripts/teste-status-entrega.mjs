// Prova que a confirmação de entrega funciona — inclusive o caso que eu tinha
// implementado errado: a Meta manda o bloco `statuses` no campo `messages`.
// Cria mensagem de teste na empresa 3, aplica os status na ordem real e limpa.
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'

const PREVIEW = 'https://guiuzbcqkvelqcuogxtd.supabase.co/functions/v1/webhook-leads-preview'
const FONE = '5511999990002'
const CLIENTE = '5511988886666'
const WAMID = 'wamid.teste.status.001'
const EMPRESA = 3

const env = {}
for (const l of readFileSync('D:/Empresa TI/CRM-SaaS/.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !env[m[1]]) env[m[1]] = m[2].trim()
}
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
const SB = env.NEXT_PUBLIC_SUPABASE_URL
const rest = (p, init) => fetch(`${SB}/rest/v1/${p}`, { headers: H, ...init })

const KEY = Buffer.from(env.CHANNEL_ENCRYPTION_KEY, 'hex')
function cifrar(t) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const e = Buffer.concat([c.update(t, 'utf8'), c.final()])
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), e.toString('base64')].join('.')
}
const assinar = (b) => 'sha256=' + crypto.createHmac('sha256', env.META_APP_SECRET).update(b).digest('hex')
async function postar(payload) {
  const corpo = JSON.stringify(payload)
  const r = await fetch(PREVIEW, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': assinar(corpo) }, body: corpo })
  return r.status
}

// canal + lead + mensagem enviada de teste
const canal = (await (await rest('canais_conectados?on_conflict=tipo,external_id', {
  method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify([{ empresa_id: EMPRESA, tipo: 'whatsapp', external_id: FONE, waba_id: 'waba-teste-st', nome_exibicao: 'TESTE STATUS (apagar)', access_token_enc: cifrar('token-falso'), status: 'ativo' }]),
})).json())[0]

const lead = (await (await rest('leads', {
  method: 'POST', headers: { ...H, Prefer: 'return=representation' },
  body: JSON.stringify([{ empresa_id: EMPRESA, nome: 'Cliente Status', telefone: CLIENTE, origem: 'whatsapp', origem_id: CLIENTE, kanban_status: 'novo', ativo: true }]),
})).json())[0]

await rest('lead_mensagens', {
  method: 'POST', headers: { ...H, Prefer: 'return=representation' },
  body: JSON.stringify([{ empresa_id: EMPRESA, lead_id: lead.id, direcao: 'enviada', conteudo: 'mensagem de teste', origem: 'whatsapp', lida: true, external_id: WAMID, status_entrega: 'enviada' }]),
})

const ler = async () => (await (await rest(`lead_mensagens?select=status_entrega,erro_envio&external_id=eq.${WAMID}`)).json())[0]

// A Meta manda com field "messages" e bloco "statuses" — é ESTE o formato real.
const evento = (status, extra = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba-teste-st', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: FONE, phone_number_id: FONE },
    statuses: [{ id: WAMID, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: CLIENTE, ...extra }],
  } }] }],
})

let ok = 0, falhou = 0
const checar = (nome, cond, det = '') => { if (cond) { ok++; console.log(`✅ ${nome}${det ? ' · ' + det : ''}`) } else { falhou++; console.log(`❌ ${nome}${det ? ' · ' + det : ''}`) } }

await postar(evento('delivered')); await new Promise((r) => setTimeout(r, 900))
let m = await ler()
checar('campo "messages" com bloco statuses → marca ENTREGUE', m?.status_entrega === 'entregue', `status=${m?.status_entrega}`)

await postar(evento('read')); await new Promise((r) => setTimeout(r, 900))
m = await ler()
checar('status read → marca LIDA', m?.status_entrega === 'lida', `status=${m?.status_entrega}`)

await postar(evento('failed', { errors: [{ code: 131049, title: 'This message was not delivered to maintain healthy ecosystem engagement.' }] }))
await new Promise((r) => setTimeout(r, 900))
m = await ler()
checar('falha guarda motivo em português', m?.status_entrega === 'falhou' && /Meta limitou/.test(m?.erro_envio ?? ''), m?.erro_envio?.slice(0, 60))

// limpeza
await rest(`lead_mensagens?lead_id=eq.${lead.id}`, { method: 'DELETE', headers: H })
await rest(`leads?id=eq.${lead.id}`, { method: 'DELETE', headers: H })
await rest(`canais_conectados?id=eq.${canal.id}`, { method: 'DELETE', headers: H })
const sobrou = (await (await rest(`leads?select=id&empresa_id=eq.${EMPRESA}`)).json()).length
console.log(`\nlimpeza: ${sobrou} lead(s) restante(s) na empresa ${EMPRESA} (esperado 0)`)
console.log(`${ok} passaram · ${falhou} falharam`)
process.exit(falhou ? 1 : 0)
