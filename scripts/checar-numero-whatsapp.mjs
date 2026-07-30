// Checagem SOMENTE LEITURA do estado de um número de WhatsApp, antes de conectar.
// Responde a pergunta que importa: o número está em coexistência (roda no app do
// celular E na API) ou não? Nada aqui altera nada — só GET na Graph.
//
//   node scripts/checar-numero-whatsapp.mjs <TOKEN_DE_USUARIO_DE_SISTEMA>
//
// O token não é gravado em lugar nenhum: entra por argumento e morre com o processo.
const token = process.argv[2]
if (!token) {
  console.error('uso: node scripts/checar-numero-whatsapp.mjs <TOKEN>')
  process.exit(1)
}
const V = process.env.META_GRAPH_VERSION || 'v25.0'
const G = `https://graph.facebook.com/${V}`
const pega = async (p) => {
  const r = await fetch(`${G}/${p}${p.includes('?') ? '&' : '?'}access_token=${token}`)
  return { ok: r.ok, body: await r.json() }
}

// 1) Contas WhatsApp que este token alcança
const negocios = await pega('me/businesses?fields=id,name')
if (!negocios.ok) {
  // Token de usuário de sistema não responde /me/businesses; vai pelos escopos.
  console.log('(seguindo pelos escopos do token)')
}

const dbg = await fetch(`${G}/debug_token?input_token=${token}&access_token=${token}`).then((r) => r.json())
const escopos = dbg?.data?.granular_scopes ?? []
const wabas = new Set()
for (const e of escopos) {
  if (/whatsapp_business/.test(e.scope || '')) (e.target_ids ?? []).forEach((id) => wabas.add(id))
}
console.log(`tipo do token: ${dbg?.data?.type ?? '?'} · expira: ${dbg?.data?.expires_at ? new Date(dbg.data.expires_at * 1000).toLocaleDateString('pt-BR') : 'NUNCA'}`)
console.log(`contas de WhatsApp alcançadas: ${wabas.size ? [...wabas].join(', ') : 'nenhuma'}\n`)

for (const waba of wabas) {
  const info = await pega(`${waba}?fields=id,name,timezone_id`)
  console.log(`▸ conta ${waba} — ${info.body?.name ?? '?'}`)

  const nums = await pega(`${waba}/phone_numbers?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type,quality_rating,code_verification_status`)
  for (const n of (nums.body?.data ?? [])) {
    const coex = n.is_on_biz_app && n.platform_type === 'CLOUD_API'
    console.log(`   número ${n.display_phone_number ?? '?'} (${n.verified_name ?? '?'})`)
    console.log(`     id: ${n.id}`)
    console.log(`     plataforma: ${n.platform_type ?? '?'} · no app do celular: ${n.is_on_biz_app ? 'SIM' : 'não'}`)
    console.log(`     ${coex ? '✅ COEXISTÊNCIA ATIVA — conectar é seguro e o celular continua funcionando'
      : n.platform_type === 'CLOUD_API' ? '⚠️  SÓ NA API — este número NÃO está no app do celular'
      : '⚠️  NÃO está na Cloud API — conectar não desconecta nada, mas o CRM ainda não vai receber por ele'}`)
    console.log(`     verificação: ${n.code_verification_status ?? '?'} · qualidade: ${n.quality_rating ?? 'n/d'}`)
  }

  const sub = await pega(`${waba}/subscribed_apps`)
  const apps = (sub.body?.data ?? []).map((a) => a.whatsapp_business_api_data?.name ?? a.name ?? a.id)
  console.log(`   webhook assinado por: ${apps.length ? apps.join(', ') : 'NENHUM app'}\n`)
}

console.log('(somente leitura: nada foi alterado)')
