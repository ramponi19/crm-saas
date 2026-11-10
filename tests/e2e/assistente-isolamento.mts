// ISOLAMENTO ENTRE EMPRESAS das funções novas do Assistente (10/11/2026, condição do Lucas para a
// migração 20261110000300). Banco LOCAL. Um usuário da JM (Eduardo Abreu, admin da empresa 1), com o
// login dele, tenta obter dados de OUTRA empresa trocando parâmetros:
//   - chamando assistente_status_leads direto (só service role pode);
//   - chamando assistente_leads_visiveis com a empresa / a loja de outra empresa (RLS dele);
//   - sem login (anon);
//   - pelo Assistente, pedindo a loja de outra empresa pelo nome;
//   - e se um defeito no servidor trocasse a empresa: os leads vêm da sessão dele, a resposta sai vazia.
//   node --import ./tests/alias.mjs tests/e2e/assistente-isolamento.mts
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { acessoDoUsuario } from '@/lib/assistente/acesso'
import { executar } from '@/lib/assistente/ferramentas'
import { esquecerTudo } from '@/lib/assistente/cache'

const env = Object.fromEntries(readFileSync('tests/e2e/status.local.env', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^(\w+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m![1], m![2]]))
if (!/127\.0\.0\.1|localhost/.test(env.API_URL)) throw new Error('RECUSADO: não é o banco local')
const sql = (q: string) => execFileSync('C:/Ferramentas/pgsql-18.4/bin/psql.exe',
  ['host=127.0.0.1 port=54322 dbname=postgres user=postgres password=postgres', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-F', '|', '-c', q],
  { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } }).trim().replace(/\r/g, '')

const EDUARDO = 'dea818d4-f6fb-494d-8346-1462986b0828'
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const corpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: EDUARDO, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`
const jwt = `${corpo}.${createHmac('sha256', env.JWT_SECRET).update(corpo).digest('base64url')}`
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const db = createClient(env.API_URL, env.ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${jwt}` } } })
const anon = createClient(env.API_URL, env.ANON_KEY, opts)
const svc = createClient(env.API_URL, env.SERVICE_ROLE_KEY, opts)

// A outra empresa: a 5 (Preview · Loja), que na cópia não tem lead. Ganha um lead COM conversa e ficha
// (marca PROVA ISOLAMENTO), apagado no fim, passe ou falhe — senão "nada da outra empresa" não provaria nada.
const OUTRA = 5
const MARCA = 'PROVA ISOLAMENTO'
const limpar = () => {
  sql(`delete from zapintel_lead_perfil where empresa_id=${OUTRA} and perfil->>'marca_teste' = '${MARCA}'`)
  sql(`delete from mensagens where empresa_id=${OUTRA} and conteudo = '${MARCA}'`)
  sql(`delete from negocios where empresa_id=${OUTRA} and contato_id in (select id from contatos where empresa_id=${OUTRA} and nome = '${MARCA}')`)
  sql(`delete from conversas where empresa_id=${OUTRA} and contato_id in (select id from contatos where empresa_id=${OUTRA} and nome = '${MARCA}')`)
  sql(`delete from contatos where empresa_id=${OUTRA} and nome = '${MARCA}'`)
}
limpar()
// Apaga o cenário ao sair, passe, falhe ou estoure.
process.on('exit', () => { try { limpar(); console.log(`cenário apagado (contatos de teste restantes: ${sql(`select count(*) from contatos where empresa_id=${OUTRA} and nome = '${MARCA}'`)})`) } catch (e) { console.log('FALHA ao apagar o cenário: ' + String(e).slice(0, 200)) } })
const LOJA_OUTRA = Number(sql(`select id from filiais where empresa_id=${OUTRA} order by id limit 1`))
const nomeLojaOutra = sql(`select coalesce(nullif(trim(cidade),''), nome) from filiais where id=${LOJA_OUTRA}`)
sql(`with c as (insert into contatos (empresa_id, nome, filial_id) values (${OUTRA}, '${MARCA}', ${LOJA_OUTRA}) returning id),
  cv as (insert into conversas (empresa_id, contato_id, filial_id) select ${OUTRA}, id, ${LOJA_OUTRA} from c returning id, contato_id),
  n as (insert into negocios (empresa_id, contato_id, filial_id, dados) select ${OUTRA}, id, ${LOJA_OUTRA}, '{"produto_interessado": "${MARCA}"}' from c returning id),
  m as (insert into mensagens (empresa_id, conversa_id, contato_id, filial_id, direcao, conteudo) select ${OUTRA}, cv.id, cv.contato_id, ${LOJA_OUTRA}, 'recebida', '${MARCA}' from cv returning id)
  insert into zapintel_lead_perfil (lead_id, empresa_id, perfil, marca, mensagens, versao)
  select n.id, ${OUTRA}, '{"classificacao": "hot", "marca_teste": "${MARCA}"}', m.id, 1, 'p2' from n, m`)
const comConversa = Number(sql(`select jsonb_array_length(public.assistente_status_leads(${OUTRA}))`))
console.log(`outra empresa: ${OUTRA}, loja ${LOJA_OUTRA} "${nomeLojaOutra}", ${comConversa} lead com conversa e ficha (cenário do teste)`)
if (comConversa < 1) { limpar(); throw new Error('o cenário da outra empresa não montou — o teste não prova nada') }

const falhas: string[] = []
const confere = (c: boolean, m: string) => { if (c) console.log('ok  ', m); else { falhas.push(m); console.log('FALHA', m) } }

// 1. status direto: nem da outra empresa, nem da própria (só service role)
for (const [quem, cli] of [['Eduardo', db], ['anon', anon]] as const) {
  for (const p of [{ p_empresa: OUTRA }, { p_empresa: OUTRA, p_filial: LOJA_OUTRA }, { p_empresa: 1 }]) {
    const { data, error } = await cli.rpc('assistente_status_leads', p)
    confere(!!error && data == null, `${quem}: assistente_status_leads(${JSON.stringify(p)}) recusada (${error?.code ?? 'SEM ERRO'})`)
  }
}

// 2. leads visíveis com parâmetros de outra empresa: RLS dele → nada
for (const p of [
  { p_empresa: OUTRA }, { p_empresa: OUTRA, p_filial: LOJA_OUTRA }, { p_empresa: 1, p_filial: LOJA_OUTRA },
  { p_empresa: OUTRA, p_responsavel: EDUARDO },
]) {
  const { data, error } = await db.rpc('assistente_leads_visiveis', p)
  confere(!error && Array.isArray(data) && data.length === 0, `Eduardo: assistente_leads_visiveis(${JSON.stringify(p)}) = ${error ? 'erro ' + error.code : (data as unknown[]).length + ' leads'}`)
}
{
  const { data, error } = await anon.rpc('assistente_leads_visiveis', { p_empresa: OUTRA })
  confere(!!error && data == null, `anon: assistente_leads_visiveis recusada (${error?.code ?? 'SEM ERRO'})`)
  const { data: proprios } = await db.rpc('assistente_leads_visiveis', { p_empresa: 1 })
  confere(Array.isArray(proprios) && proprios.length > 0, `controle: Eduardo vê os leads da própria empresa (${(proprios as unknown[] | null)?.length ?? 0})`)
}

// 3. pelo Assistente, pedindo a loja da outra empresa pelo nome
const acesso = await acessoDoUsuario(db, 1, EDUARDO)
const c = { db, svc, acesso, fuso: 'America/Sao_Paulo' }
esquecerTudo()
if (nomeLojaOutra) { // nenhuma loja da JM tem "Preview" no nome
  const r = JSON.parse(await executar(c, 'leads_buscar', { filial: nomeLojaOutra }))
  confere(typeof r.erro === 'string' && /não encontrada/.test(r.erro), `leads_buscar com a loja "${nomeLojaOutra}" da outra empresa: ${r.erro ?? 'RESPONDEU ' + r.encontrados}`)
}

// 4. defesa em profundidade: se um defeito no servidor passasse a OUTRA empresa ao contexto, o status
//    (service role) até seria da outra, mas os leads vêm da sessão do Eduardo — nada sai.
esquecerTudo()
const trocado = { ...c, acesso: { ...acesso, empresaId: OUTRA } }
for (const [nome, e] of [['leads_buscar', {}], ['leads_buscar', { esperando_loja: true }], ['leads_numeros', { de: '2020-01-01', ate: '2030-01-01', agrupar_por: 'origem' }], ['analises_pendentes', {}]] as const) {
  const r = JSON.parse(await executar(trocado, nome, e))
  const n = r.encontrados ?? r.total ?? (r.desatualizadas ?? 0) + (r.sem_analise ?? 0)
  confere(n === 0, `empresa trocada no servidor → ${nome} ${JSON.stringify(e)}: ${n} da outra empresa`)
}
esquecerTudo()

console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\ntudo ok')
process.exit(falhas.length ? 1 : 0)
