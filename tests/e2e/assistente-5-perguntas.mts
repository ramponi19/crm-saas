// AS 5 PERGUNTAS DO SMOKE DE 10/11, COM O MODELO DE VERDADE (11/11/2026). Banco LOCAL (cópia da
// produção), login do Eduardo (admin da JM), a tela do ZapIntel em "toda a rede" — o recorte passa por
// recorteDoServidor como na rota. Para cada resposta confere:
//   - a primeira linha é o recorte (negrito, "Rede JM · …" ou a loja pedida);
//   - todo número de contagem/valor/percentual do texto final está nos resultados das ferramentas;
//   - quantas consultas, quantas correções ("troca") e o tempo.
// Mais duas: a loja de fora do alcance não existe para o admin (todas estão no alcance), então a 6ª é
// uma pergunta de contagem SEM dado (o modelo não pode inventar).
//   node --import ./tests/alias.mjs tests/e2e/assistente-5-perguntas.mts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { acessoDoUsuario } from '@/lib/assistente/acesso'
import { executar } from '@/lib/assistente/ferramentas'
import { recorteDoServidor } from '@/lib/assistente/recorte'
import { respostaDoChat, MODELO_CHAT_PADRAO } from '@/lib/assistente/chat-dados'
import { semFundamento } from '@/lib/assistente/numeros'
import { esquecerTudo } from '@/lib/assistente/cache'

const env = Object.fromEntries(readFileSync('tests/e2e/status.local.env', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^(\w+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m![1], m![2]]))
if (!/127\.0\.0\.1|localhost/.test(env.API_URL)) throw new Error('RECUSADO: não é o banco local')
// A chave fica no .env.local do repositório principal (fora do git); nada dela é impresso.
const chave = readFileSync('D:/Empresa TI/CRM-SaaS/.env.local', 'utf8').match(/^ANTHROPIC_API_KEY="?([^"\r\n]+)"?/m)?.[1]
if (!chave) throw new Error('sem ANTHROPIC_API_KEY no .env.local')
process.env.ANTHROPIC_API_KEY = chave

const EDUARDO = 'dea818d4-f6fb-494d-8346-1462986b0828'
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const corpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: EDUARDO, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`
const jwt = `${corpo}.${createHmac('sha256', env.JWT_SECRET).update(corpo).digest('base64url')}`
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const db = createClient(env.API_URL, env.ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${jwt}` } } })
const svc = createClient(env.API_URL, env.SERVICE_ROLE_KEY, opts)

const acesso = await acessoDoUsuario(db, 1, EDUARDO)
const r = await recorteDoServidor({ db, svc, empresaId: 1, empresaNome: 'JM Store Importados', acesso, pedido: { zapintel: true, filial: null } })
if ('erro' in r) throw new Error(r.erro)

const PERGUNTAS = [
  'Quais leads de Jaguariúna estão em aberto?',
  'Quem está esperando resposta da loja agora?',
  'Quais leads conversaram nos últimos 7 dias e ainda estão em aberto?',
  'Quantos leads novos entraram este mês, por origem?',
  'Quais leads quentes estão parados há mais de 3 dias?',
  'Quantos clientes a loja atendeu no sábado de manhã pelo telefone fixo?',
]

esquecerTudo()
const falhas: string[] = []
const relatorio: unknown[] = []
for (const pergunta of PERGUNTAS) {
  const resultados: string[] = []
  const t0 = Date.now()
  const resp = respostaDoChat({
    db, svc, ler: r.ler, recorte: r.recorte, acesso,
    executor: async (c, nome, e) => { const s = await executar(c, nome, e); resultados.push(s); return s },
    turnos: [{ role: 'user', text: pergunta }],
    modelo: MODELO_CHAT_PADRAO, empresa: 'JM Store Importados', preset: null, lojas: r.lojas,
    tela: 'ZapIntel', extra: null, fuso: 'America/Sao_Paulo', registrar: async () => {},
  })
  const eventos = (await resp.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as { t: string; v: string })
  let tela = ''
  for (const e of eventos) { if (e.t === 'troca') tela = e.v; else if (e.t === 'txt') tela += e.v }
  const ms = Date.now() - t0
  const consultas = eventos.filter((e) => e.t === 'tool').length
  const trocas = eventos.filter((e) => e.t === 'troca').length
  const erro = eventos.find((e) => e.t === 'erro')?.v
  // A linha do recorte ("**Rede JM · …**"). Antes dela pode haver o "vou consultar…" da 1ª rodada.
  const linhaRecorte = tela.match(/^\*\*[^*\n]+·[^*\n]+\*\*/m)?.[0]
  const primeira = linhaRecorte ?? tela.trim().split('\n')[0]
  const recorteOk = !!linhaRecorte
  const semBase = resultados.length ? semFundamento(tela, resultados) : []
  console.log(`\n── ${pergunta}\n   ${ms} ms · ${consultas} consulta(s) · ${trocas} correção(ões)${erro ? ` · ERRO ${erro}` : ''}\n   1ª linha: ${primeira}\n   sem fundamento na tela: ${semBase.length ? semBase.join(' | ') : 'nenhum'}`)
  if (!recorteOk) falhas.push(`${pergunta}: a resposta não abre com o recorte`)
  if (semBase.length) falhas.push(`${pergunta}: número sem fundamento na tela: ${semBase.join(', ')}`)
  if (erro) falhas.push(`${pergunta}: ${erro}`)
  relatorio.push({ pergunta, ms, consultas, trocas, primeira, tela })
}
mkdirSync('.gate', { recursive: true })
writeFileSync('.gate/assistente-5-perguntas.json', JSON.stringify(relatorio, null, 2))
console.log(falhas.length ? `\n${falhas.length} FALHA(S):\n- ${falhas.join('\n- ')}` : '\ntudo ok (respostas em .gate/assistente-5-perguntas.json)')
process.exit(falhas.length ? 1 : 0)
