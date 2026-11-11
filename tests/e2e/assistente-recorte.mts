// O RECORTE DO ASSISTENTE DECIDIDO NO SERVIDOR (11/11/2026). Banco LOCAL (cópia da produção).
// O corpo da requisição só diz qual loja a tela do ZapIntel mostra; quem decide se pode é o banco, com a
// sessão. Aqui, com logins de verdade (JWT local):
//   - admin da JM no ZapIntel: rede, uma loja dela, a loja de OUTRA empresa no corpo (403), lixo no corpo (400);
//   - vendedor da JM: o ZapIntel recusa (403); no CRM, pedir outra loja pelo nome responde "fora do seu alcance";
//   - com o recorte da rede, leads_buscar traz as duas lojas e diz o recorte.
//   node --import ./tests/alias.mjs tests/e2e/assistente-recorte.mts
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { acessoDoUsuario } from '@/lib/assistente/acesso'
import { executar } from '@/lib/assistente/ferramentas'
import { recorteDoServidor } from '@/lib/assistente/recorte'
import { esquecerTudo } from '@/lib/assistente/cache'

const env = Object.fromEntries(readFileSync('tests/e2e/status.local.env', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^(\w+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m![1], m![2]]))
if (!/127\.0\.0\.1|localhost/.test(env.API_URL)) throw new Error('RECUSADO: não é o banco local')
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const svc = createClient(env.API_URL, env.SERVICE_ROLE_KEY, opts)
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
function sessao(uid: string): SupabaseClient {
  const corpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`
  const jwt = `${corpo}.${createHmac('sha256', env.JWT_SECRET).update(corpo).digest('base64url')}`
  return createClient(env.API_URL, env.ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${jwt}` } } })
}

const falhas: string[] = []
const confere = (c: boolean, m: string) => { if (c) console.log('ok  ', m); else { falhas.push(m); console.log('FALHA', m) } }

const EDUARDO = 'dea818d4-f6fb-494d-8346-1462986b0828'
const { data: lojasJm } = await svc.from('filiais').select('id, nome, cidade').eq('empresa_id', 1).order('id')
const jag = (lojasJm ?? []).find((l) => /jaguari/i.test(`${l.cidade} ${l.nome}`))!
const mogi = (lojasJm ?? []).find((l) => /mogi/i.test(`${l.cidade} ${l.nome}`))!
const { data: outra } = await svc.from('filiais').select('id').neq('empresa_id', 1).order('id').limit(1).maybeSingle()
const { data: vend } = await svc.from('empresa_usuarios').select('usuario_id, filial_id')
  .eq('empresa_id', 1).eq('ativo', true).eq('role', 'vendedor').eq('filial_id', mogi.id).limit(1).maybeSingle()
console.log(`JM: Mogi ${mogi.id}, Jaguariúna ${jag.id}; loja de outra empresa: ${outra?.id}; vendedor de Mogi: ${vend?.usuario_id ?? 'NENHUM'}`)

// ── admin da JM ──────────────────────────────────────────────────────────────
const dbE = sessao(EDUARDO)
const acE = await acessoDoUsuario(dbE, 1, EDUARDO)
const rec = (db: SupabaseClient, ac: typeof acE, pedido: unknown) =>
  recorteDoServidor({ db, svc, empresaId: 1, empresaNome: 'JM Store Importados', acesso: ac, pedido })

const rede = await rec(dbE, acE, { zapintel: true, filial: null })
confere(!('erro' in rede) && rede.recorte.rotulo === 'Rede JM' && rede.recorte.loja === null && !!rede.ler,
  `ZapIntel, rede → ${'erro' in rede ? rede.erro : `${rede.recorte.rotulo}, alcance ${rede.recorte.alcance}`}`)
const umaLoja = await rec(dbE, acE, { zapintel: true, filial: jag.id })
confere(!('erro' in umaLoja) && umaLoja.recorte.loja === jag.id && /jaguari/i.test(umaLoja.recorte.rotulo),
  `ZapIntel, Jaguariúna → ${'erro' in umaLoja ? umaLoja.erro : umaLoja.recorte.rotulo}`)
const trocada = await rec(dbE, acE, { zapintel: true, filial: outra?.id })
confere('erro' in trocada && trocada.status === 403, `corpo com a loja ${outra?.id} de OUTRA empresa → ${'erro' in trocada ? `${trocada.status} ${trocada.erro}` : 'ACEITOU'}`)
const lixo = await rec(dbE, acE, { zapintel: true, filial: 'abc' })
confere('erro' in lixo && lixo.status === 400, `corpo com loja inválida → ${'erro' in lixo ? lixo.status : 'ACEITOU'}`)
const crm = await rec(dbE, acE, undefined)
confere(!('erro' in crm) && !crm.ler, `CRM (sem recorte no corpo) → leitura pela sessão (RLS); ${'erro' in crm ? crm.erro : crm.recorte.rotulo}`)

// Com o recorte da rede, leads_buscar traz as duas lojas e diz o recorte.
if (!('erro' in rede)) {
  esquecerTudo()
  const c = { db: dbE, svc, acesso: acE, fuso: 'America/Sao_Paulo', ler: rede.ler, recorte: rede.recorte }
  const r = JSON.parse(await executar(c, 'leads_buscar', { limite: 40, ativo_nos_ultimos_dias: 30 })) as { recorte: string; leads: { loja: string }[] }
  const lojasNaResposta = new Set(r.leads.map((l) => l.loja))
  confere(r.recorte === 'Rede JM' && lojasNaResposta.size >= 2, `leads_buscar na rede → recorte "${r.recorte}", lojas ${[...lojasNaResposta].join(', ')}`)
  const j = JSON.parse(await executar(c, 'leads_buscar', { filial: 'Jaguariúna', limite: 5 })) as { recorte?: string; erro?: string }
  confere(!j.erro && /jaguari/i.test(j.recorte ?? ''), `admin pede Jaguariúna pelo nome → ${j.erro ?? j.recorte}`)
  const lojaTela = await rec(dbE, acE, { zapintel: true, filial: mogi.id })
  if (!('erro' in lojaTela)) {
    const m = JSON.parse(await executar({ ...c, ler: lojaTela.ler, recorte: lojaTela.recorte }, 'leads_buscar', { limite: 40 })) as { recorte: string; leads: { loja: string }[] }
    confere(m.recorte === lojaTela.recorte.rotulo && m.leads.every((l) => l.loja === lojaTela.recorte.rotulo),
      `tela em Mogi, sem loja na pergunta → recorte "${m.recorte}", lojas ${[...new Set(m.leads.map((l) => l.loja))].join(', ')}`)
  }
}

// ── vendedor da JM (loja Mogi) ───────────────────────────────────────────────
if (vend) {
  const dbV = sessao(vend.usuario_id as string)
  const acV = await acessoDoUsuario(dbV, 1, vend.usuario_id as string)
  const zi = await rec(dbV, acV, { zapintel: true, filial: null })
  confere('erro' in zi && zi.status === 403, `vendedor no ZapIntel → ${'erro' in zi ? `${zi.status} ${zi.erro}` : 'ACEITOU'}`)
  const ziJag = await rec(dbV, acV, { zapintel: true, filial: jag.id })
  confere('erro' in ziJag && ziJag.status === 403, `vendedor troca a loja no corpo para Jaguariúna → ${'erro' in ziJag ? ziJag.status : 'ACEITOU'}`)
  const crmV = await rec(dbV, acV, undefined)
  if (!('erro' in crmV)) {
    esquecerTudo()
    const c = { db: dbV, svc, acesso: acV, fuso: 'America/Sao_Paulo', ler: crmV.ler, recorte: crmV.recorte }
    const r = JSON.parse(await executar(c, 'leads_buscar', { filial: 'Jaguariúna' })) as { erro?: string }
    confere(/fora do seu alcance/.test(r.erro ?? ''), `vendedor de Mogi pede Jaguariúna → ${r.erro ?? 'RESPONDEU'}`)
  }
} else {
  falhas.push('sem vendedor de Mogi na cópia local para o teste')
}
esquecerTudo()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
process.exit(falhas.length ? 1 : 0)
