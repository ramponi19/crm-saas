/**
 * CONFERÊNCIA PÓS-DEPLOY EM PRODUÇÃO — roda NA PÁGINA, com a sessão de quem
 * está logado (o Claude executa pelo navegador depois de cada login; também
 * dá para colar no console do navegador). Só LÊ: nenhuma rota de IA é chamada
 * com lead válido, nada é gravado. Devolve só resultados — nunca o token.
 *
 * Uso: conferir('dono', CHAVE_PUBLICA) — papel: dono | vendedor | superadmin | sem-zapintel.
 * CHAVE_PUBLICA = NEXT_PUBLIC_SUPABASE_ANON_KEY (é pública; vai no navegador de qualquer forma).
 *
 * Leads de referência (15/10/2026): 615 = Mogi Guaçu (JM), 1706 = Jaguariúna
 * (JM), 1204 = Imobiliária, 2743 = funil interno da JM.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- chamada pelo console / pelo navegador do Claude
async function conferir(papel, chavePublica) {
  const r = {}
  const st = async (url, opt) => (await fetch(url, { redirect: 'manual', ...opt })).status
  const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body })

  // Rotas do ZapIntel: o que cada papel deve receber.
  const esperado = {
    dono:           { 615: 200, 1706: 200, 1204: 404 },
    vendedor:       { 615: 200, 1706: 404, 1204: 404 },   // reviewer.meta: só Mogi
    superadmin:     { 615: 200, 1706: 200, 1204: 404 },
    'sem-zapintel': { 615: 403, 1706: 403, 1204: 403 },
  }[papel]
  for (const [lead, codigo] of Object.entries(esperado)) {
    const s = await st(`/zapintel/api/conversa?lead=${lead}`)
    r[`conversa ${lead}`] = s === codigo ? `ok (${s})` : `FALHOU: ${s}, esperado ${codigo}`
  }
  if (papel !== 'sem-zapintel') {
    const s1 = await st('/zapintel/api/perfil', post('{"lead":2743}'))
    r['análise de funil interno'] = s1 === 422 ? 'ok (422, sem IA)' : `FALHOU: ${s1}`
    const s2 = await st('/zapintel/api/perfil', post('null'))
    r['corpo nulo'] = s2 === 400 ? 'ok (400)' : `FALHOU: ${s2}`
    const p = await fetch('/zapintel/api/perfil/pendentes')
    r['fila do robô'] = p.ok ? `ok (${p.status})` : `FALHOU: ${p.status}`
  }

  // Bucket de contratos, com a própria sessão (o token fica na página).
  try {
    const bruto = document.cookie.split('; ').filter((c) => c.startsWith('sb-') && c.includes('-auth-token'))
      .sort().map((c) => decodeURIComponent(c.split('=').slice(1).join('='))).join('')
    const json = bruto.startsWith('base64-') ? atob(bruto.slice(7)) : bruto
    const token = JSON.parse(json).access_token
    const base = 'https://guiuzbcqkvelqcuogxtd.supabase.co'
    const listar = async (pasta) => {
      const x = await fetch(`${base}/storage/v1/object/list/contratos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: chavePublica, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: pasta, limit: 200 }),
      })
      return x.ok ? (await x.json()).length : `erro ${x.status}`
    }
    r['contratos: fundos da JM (pasta 1)'] = await listar('1')
    r['contratos: fundos da Imobiliária (pasta 3)'] = await listar('3')
  } catch (e) {
    r['contratos'] = `não conferido aqui (${e.message}) — conferir pela tela do editor de modelo`
  }

  // Sino do topo (só nas telas do CRM, não no /zapintel).
  const sino = document.querySelector('header button[aria-label*="otifica"], header [data-sino]')
  r['sino na tela'] = sino ? (sino.innerText || 'presente') : 'abrir /dashboard para ver o sino'
  return r
}
