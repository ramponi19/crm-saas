#!/usr/bin/env node
/**
 * TUDO FORA DO CORE É MÓDULO (05/11/2026) — o ponto 2 da regra "Como nasce um
 * módulo" (docs/reconstrucao-nexus/05-RUNBOOK-CORTE.md), conferido no build.
 *
 * Toda tela (page.tsx) e toda rota (route.ts) de app/ tem um dono:
 *
 *   core        Dashboard, Leads/Funil, Clientes, Tarefas, Comunicação, Insights,
 *               Automações e Configurações (com a Central e a Equipe);
 *   plataforma  o que não é da loja: login, cadastro, superadmin, vitrine, landing,
 *               webhooks, cron, cobrança do SaaS, rastreamento;
 *   módulo      uma chave do manifesto (core/modulos.ts).
 *
 * O build reprova quando:
 *   FORA       a rota não é do core, da plataforma nem de um módulo do manifesto
 *              (funcionalidade nova nasce como módulo, com entrada no manifesto);
 *   SEM TRAVA  a rota é de um módulo e nada no servidor confere "módulo ligado".
 *              A trava do proxy (lib/menu.ts → moduloDaRota) cobre as TELAS que
 *              moram no endereço do módulo ou na rota da ferramenta; o resto (API,
 *              tela pública, o ZapIntel, que não é item do menu) confere no próprio
 *              arquivo — ou num layout acima da tela — com uma destas:
 *              exigirModuloLigado (lib/modulo-ligado.ts), moduloLigado,
 *              ligadosDaEmpresa, inteligenciaLigada, zapintelAcesso;
 *   LIMPO      um arquivo da lista de exceções foi corrigido ou sumiu: tire da lista.
 *
 * A lista (scripts/modulos-excecoes.json) é o que já existia em 05/11/2026 e SÓ
 * ENCOLHE: não se acrescenta rota nova nela.
 *
 *   node scripts/check-modulos.mjs              confere (entra no npm run build)
 *   node scripts/check-modulos.mjs --listar     mostra cada rota com o dono (não confere)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'

const RAIZ = process.cwd()
const ARQ_EXCECOES = join(RAIZ, 'scripts', 'modulos-excecoes.json')
const ler = (p) => readFileSync(join(RAIZ, p), 'utf8')

// ── O manifesto e o menu, lidos do código (sem importar TypeScript) ──────────
const manifesto = ler('core/modulos.ts')
const ini = manifesto.indexOf('export const MODULOS')
const corpo = manifesto.slice(ini, manifesto.indexOf('\n]', ini))
/** chave → { href, addon } */
const MODULOS = new Map()
for (const bloco of corpo.split(/\{\s*chave:/).slice(1)) {
  const chave = bloco.match(/^\s*'([a-z][a-z0-9_]*)'/)?.[1]
  const href = bloco.match(/href:\s*'([^']+)'/)?.[1]
  if (chave && href) MODULOS.set(chave, { href, addon: /addon:\s*true/.test(bloco) })
}
if (MODULOS.size < 10) { console.error(`✗ check-modulos: li só ${MODULOS.size} módulos de core/modulos.ts — o formato mudou?`); process.exit(1) }
const MODULO_DO_HREF = new Map([...MODULOS].map(([chave, m]) => [m.href, chave]))

const menu = ler('lib/menu.ts')
/** rota da ferramenta → href do item (Simular parcela mora em /orcamentos/parcela). */
const FERRAMENTAS = new Map()
for (const m of menu.matchAll(/href:\s*'([^']+)'[^}\n]*ferramenta:\s*\{\s*rota:\s*'([^']+)'/g)) FERRAMENTAS.set(m[2], m[1])
if (FERRAMENTAS.size === 0) { console.error('✗ check-modulos: nenhuma ferramenta lida de lib/menu.ts — o formato mudou?'); process.exit(1) }

// ── Donos fixos, pelo prefixo do caminho (o mais longo vence) ────────────────
const CORE = 'core'
const PLAT = 'plataforma'
const mod = (chave) => {
  if (!MODULOS.has(chave)) { console.error(`✗ check-modulos: '${chave}' não está no manifesto`); process.exit(1) }
  return 'mod:' + chave
}
const DONOS = {
  // core — telas
  '/dashboard': CORE, '/leads': CORE, '/clientes': CORE, '/tarefas': CORE, '/comunicacao': CORE,
  '/configuracoes': CORE, '/modulos': CORE, '/equipe': CORE,
  // core — Insights e Automações (os itens `sempreLiberado` do menu)
  '/visao-geral': CORE, '/conversao': CORE, '/metas': CORE, '/cadencias': CORE, '/distribuicao': CORE,
  '/scoring': CORE, '/modelos': CORE, '/respostas': CORE, '/automacoes': CORE,
  // core — APIs
  '/api/acesso': CORE, '/api/admin/filiais': CORE, '/api/aparencia': CORE, '/api/ausencia': CORE,
  '/api/automatize': CORE, '/api/cadencias': CORE, '/api/canais': CORE, '/api/clientes': CORE,
  '/api/comunicacao': CORE, '/api/contatos': CORE, '/api/distribuicao': CORE, '/api/empresa': CORE,
  '/api/equipe': CORE, '/api/exportar': CORE, '/api/filial': CORE, '/api/funil': CORE, '/api/funis': CORE,
  '/api/leads': CORE, '/api/menu-config': CORE, '/api/metas': CORE, '/api/midia': CORE, '/api/modelos': CORE,
  '/api/modulos': CORE, '/api/permissoes': CORE, '/api/push': CORE, '/api/reativacao': CORE,
  '/api/scoring': CORE, '/api/whatsapp': CORE,
  // as taxas da maquininha são uma seção de Configurações (o PDV e o Simular parcela leem)
  '/api/taxas': CORE,

  // plataforma
  '/login': PLAT, '/register': PLAT, '/entrar': PLAT, '/reset-senha': PLAT, '/offline': PLAT, '/privacy': PLAT,
  '/superadmin': PLAT, '/vitrine': PLAT, '/design': PLAT, '/para': PLAT, '/landing': PLAT,
  '/i': PLAT, '/track.js': PLAT,
  // só redireciona para /catalogo (a trava da tela de destino vale)
  '/produtos': PLAT,
  '/api/superadmin': PLAT, '/api/cron': PLAT, '/api/saude': PLAT, '/api/register': PLAT,
  '/api/planos-publicos': PLAT, '/api/stripe': PLAT, '/api/rastreamento': PLAT,
  '/api/payments/webhook': PLAT,
  // o superadmin inspeciona o ZapIntel de qualquer empresa (cookie próprio)
  '/api/zapintel/preview': PLAT,

  // módulo — telas públicas (link com token, site da loja)
  '/agendar': mod('agenda'), '/os': mod('assistencia'), '/orcamento': mod('orcamentos'),
  '/proposta': mod('propostas'), '/imovel': mod('imoveis'), '/imob': mod('imoveis'), '/menu': mod('cardapio'),
  // módulo — APIs cujo nome não é o endereço do módulo
  '/api/agendar': mod('agenda'), '/api/os': mod('assistencia'), '/api/orcamento': mod('orcamentos'),
  '/api/imob': mod('imoveis'), '/api/portais': mod('imoveis'), '/api/admin/importar-imoveis': mod('imoveis'),
  '/api/match': mod('imoveis'), '/api/menu': mod('cardapio'), '/api/veiculos': mod('avaliacoes'),
  '/api/fipe': mod('consulta_fipe'), '/api/troca': mod('orcamentos'), '/api/reservas': mod('estoque'),
  '/api/contrato-documentos': mod('pdv'), '/api/contrato-modelo': mod('pdv'),
  '/api/payments': mod('financeiro'),
  '/api/zapintel': mod('inteligencia'), '/zapintel': mod('inteligencia'),
}
const PREFIXOS = Object.keys(DONOS).sort((a, b) => b.length - a.length)

const GUARDA = /\b(exigirModuloLigado|moduloLigado|ligadosDaEmpresa|inteligenciaLigada|zapintelAcesso)\s*\(/

// ── As rotas ─────────────────────────────────────────────────────────────────
function arquivos(dir) {
  const out = []
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) { if (nome !== 'node_modules' && !nome.startsWith('.')) out.push(...arquivos(p)) }
    else if (/^(page|route)\.(tsx?|jsx?)$/.test(nome)) out.push(p)
  }
  return out
}

/** app/(dashboard)/estoque/imei/page.tsx → /estoque/imei (grupos e slots não entram no endereço). */
function caminho(rel) {
  const partes = rel.split('/').slice(1, -1).filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'))
  return '/' + partes.join('/')
}

function dono(url, ehTela) {
  if (url === '/') return { dono: PLAT }
  const fixo = PREFIXOS.find((p) => url === p || url.startsWith(p + '/'))
  if (fixo) return { dono: DONOS[fixo] }
  // A trava do proxy: a rota da ferramenta e o endereço do módulo (primeiro segmento).
  if (ehTela) {
    const f = [...FERRAMENTAS.keys()].find((r) => url === r || url.startsWith(r + '/'))
    if (f && MODULO_DO_HREF.has(FERRAMENTAS.get(f))) return { dono: 'mod:' + MODULO_DO_HREF.get(FERRAMENTAS.get(f)), proxy: true }
  }
  const raiz = '/' + url.split('/')[1]
  if (!url.startsWith('/api/') && MODULO_DO_HREF.has(raiz)) {
    const chave = MODULO_DO_HREF.get(raiz)
    return { dono: 'mod:' + chave, proxy: !MODULOS.get(chave).addon }
  }
  // /api/estoque, /api/garantia...: o nome da API é o endereço do módulo.
  if (url.startsWith('/api/')) {
    const seg = '/' + url.split('/')[2]
    if (MODULO_DO_HREF.has(seg)) return { dono: 'mod:' + MODULO_DO_HREF.get(seg) }
  }
  return { dono: null }
}

/** O arquivo, e para tela os layouts acima dela, conferem "módulo ligado"? */
function temGuarda(abs, ehTela) {
  if (GUARDA.test(readFileSync(abs, 'utf8'))) return true
  if (!ehTela) return false
  let d = dirname(abs)
  const app = join(RAIZ, 'app')
  while (d.startsWith(app)) {
    for (const n of ['layout.tsx', 'layout.ts']) {
      const l = join(d, n)
      if (existsSync(l) && GUARDA.test(readFileSync(l, 'utf8'))) return true
    }
    if (d === app) break
    d = dirname(d)
  }
  return false
}

const achados = new Map() // arquivo → { motivo, modulo? }
const listar = process.argv.includes('--listar')
for (const abs of arquivos(join(RAIZ, 'app'))) {
  const rel = relative(RAIZ, abs).split('\\').join('/')
  const ehTela = /\/page\.[jt]sx?$/.test(rel)
  const url = caminho(rel)
  const d = dono(url, ehTela)
  if (listar) console.log(`${(d.dono ?? 'FORA').padEnd(26)} ${d.proxy ? 'proxy ' : '      '}${url}  (${rel})`)
  if (!d.dono) { achados.set(rel, { motivo: 'fora' }); continue }
  if (d.dono.startsWith('mod:') && !d.proxy && !temGuarda(abs, ehTela)) achados.set(rel, { motivo: 'sem-trava', modulo: d.dono.slice(4) })
}
if (listar) process.exit(0)

const lista = existsSync(ARQ_EXCECOES) ? JSON.parse(readFileSync(ARQ_EXCECOES, 'utf8')).rotas ?? {} : {}
const erros = []
for (const [arq, a] of achados) {
  const e = lista[arq]
  if (e && e.motivo === a.motivo) continue
  if (a.motivo === 'fora') erros.push(`FORA       ${arq}: não é do core, da plataforma nem de um módulo do manifesto — funcionalidade nova nasce como módulo (core/modulos.ts) ou entra num dono em scripts/check-modulos.mjs`)
  else erros.push(`SEM TRAVA  ${arq}: rota do módulo '${a.modulo}' sem conferir "módulo ligado" no servidor — use exigirModuloLigado(empresaId, '${a.modulo}') de lib/modulo-ligado.ts`)
}
for (const [arq, e] of Object.entries(lista)) {
  const a = achados.get(arq)
  if (!a || a.motivo !== e.motivo) erros.push(`LIMPO      ${arq}: não é mais '${e.motivo}' (ou sumiu) — tire de scripts/modulos-excecoes.json`)
}

const porMotivo = {}
for (const e of Object.values(lista)) porMotivo[e.motivo] = (porMotivo[e.motivo] ?? 0) + 1
if (erros.length) {
  console.error('✗ TUDO FORA DO CORE É MÓDULO:\n')
  for (const e of erros) console.error('  ' + e)
  console.error('\n  A lista de exceções só encolhe. Ver o cabeçalho de scripts/check-modulos.mjs.')
  process.exit(1)
}
console.log(`✓ módulos ok — ${MODULOS.size} no manifesto; exceções: ${Object.entries(porMotivo).map(([m, n]) => `${m} ${n}`).join(', ') || 'nenhuma'}; nenhuma rota nova fora delas`)
