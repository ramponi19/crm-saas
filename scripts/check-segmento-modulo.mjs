#!/usr/bin/env node
/**
 * SEGMENTO SÓ DENTRO DO SEU MÓDULO (17/11/2026, regra do Matheus: "o core é genérico; tudo que é de
 * um segmento vive dentro de um módulo e só aparece com ele ligado; nada solto, nada sem dono").
 *
 * Duas conferências, no `check` e no `build`, SEM lista de exceções:
 *
 *  1. TEXTO DE SEGMENTO. Varre app/, components/, lib/, hooks/, core/ e proxy.ts. Em cada arquivo, tira os
 *     comentários e olha só o que a pessoa lê: textos entre aspas e texto de JSX. Um termo de segmento
 *     (celular: IMEI, iPhone, aparelho, seminovo; imóvel: imóvel, imobiliária, corretor, vistoria;
 *     veículo: veículo, FIPE, placa, chassi; restaurante: cardápio, cozinha, comanda; clínica:
 *     paciente, clínica…) só pode aparecer num arquivo DO MÓDULO dono do segmento. Quem é dono de um
 *     arquivo: o endereço do módulo (app/(dashboard)/<href>, app/api/<href>, components/modules/<href>,
 *     a rota da ferramenta) e a lista ARQUIVOS abaixo — que é o registro de dono, não exceção: o arquivo
 *     é do módulo e só roda com ele ligado. Clínica e estacionamento não têm módulo: não podem aparecer.
 *     Texto que não é para a loja ler (nome de coluna, chave, caminho, consulta ao banco) não conta: a
 *     string precisa ter letra maiúscula, acento ou espaço, e o que vai para .select/.eq/.from é ignorado.
 *
 *  2. TABELA SEM DONO. Toda tabela criada nas migrações (que ainda existe) é do core (lista CORE) ou de um
 *     módulo — pelo prefixo da chave/endereço do módulo ou pela lista TABELAS do módulo.
 *
 * A conferência de ROTA (toda tela/API é do core, da plataforma ou de um módulo, e a de módulo confere
 * "módulo ligado" no servidor) é o scripts/check-modulos.mjs, que também roda no build.
 *
 *   node scripts/check-segmento-modulo.mjs           confere
 *   node scripts/check-segmento-modulo.mjs --listar  mostra cada achado com o trecho (não falha)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = process.cwd()
const ler = (p) => readFileSync(join(RAIZ, p), 'utf8')

// ── Os segmentos e quem é dono de cada um ────────────────────────────────────
// `donos`: chaves do manifesto (core/modulos.ts) cujos arquivos podem usar o termo. Vazio = nenhum.
const L = '\\p{L}\\p{N}_'
const palavra = (re, flags = 'iu') => new RegExp(`(?<![${L}])(?:${re})(?![${L}])`, flags)
const SEGMENTOS = [
  { nome: 'celular', donos: ['celulares'], termos: [palavra('IMEI2?', 'u'), palavra('iphones?|ipad|macbook|airpods|apple'), palavra('smartphones?'), palavra('semi-?novos?'), palavra('aparelhos?')] },
  { nome: 'imóvel', donos: ['imoveis'], termos: [palavra('im[oó]vel|im[oó]veis'), palavra('imobili[aá]ri[ao]s?'), palavra('corretor(?:es|as?)?'), palavra('vistorias?'), palavra('IPTU|CRECI', 'u'), palavra('condom[ií]nios?')] },
  { nome: 'veículo', donos: ['avaliacoes', 'consulta_fipe', 'simular_financiamento'], termos: [palavra('ve[ií]culos?'), palavra('FIPE', 'u'), palavra('placas?'), palavra('chassi'), palavra('renavam'), palavra('quilometragem'), palavra('concession[aá]rias?')] },
  { nome: 'restaurante', donos: ['cardapio', 'kds'], termos: [palavra('card[aá]pios?'), palavra('cozinha'), palavra('comandas?'), palavra('gar[çc]o(?:m|ns)'), palavra('KDS', 'u')] },
  { nome: 'clínica', donos: [], termos: [palavra('pacientes?'), palavra('cl[ií]nicas?'), palavra('consult[oó]rios?'), palavra('prontu[aá]rios?')] },
  { nome: 'estacionamento', donos: [], termos: [palavra('estacionamentos?')] },
]

/**
 * DONO DE ARQUIVO além do endereço do módulo (o registro; cada arquivo aqui só roda com o módulo ligado
 * — painel do card pelo `paineisDoLead`, seção de Configurações pelo `abasConfiguracoes`, etc.).
 * Um caminho que termina em "/" é a pasta inteira.
 */
const ARQUIVOS = {
  celulares: [
    'lib/imei.ts', 'lib/apple-modelos.ts', 'lib/troca-acesso.ts', 'lib/troca-avarias.ts', 'lib/troca-checklist.ts',
    'lib/troca-modelos.ts', 'lib/troca-referencia.ts', 'components/modules/celulares/',
    'app/(dashboard)/orcamentos/cotacao/', 'app/(dashboard)/orcamentos/precos/', 'app/(dashboard)/orcamentos/checklist/',
    'app/api/troca/', 'components/modules/orcamentos/troca-modal.tsx', 'components/modules/orcamentos/avaliar-aparelho.tsx',
  ],
  imoveis: [
    'app/imob/', 'app/imovel/', 'app/api/imob/', 'app/api/portais/', 'app/api/match/', 'app/api/admin/importar-imoveis/',
    'lib/match-imoveis.ts', 'lib/importar-imoveis.ts', 'lib/captacao-imob.ts', 'lib/comissao-imob.ts', 'lib/chave-imovel.ts',
    'components/modules/imoveis/',
  ],
  avaliacoes: ['app/api/veiculos/', 'lib/match-veiculos.ts', 'components/modules/veiculos/'],
  consulta_fipe: ['app/api/fipe/', 'lib/fipe.ts', 'app/superadmin/fipe/', 'app/api/superadmin/fipe/'],
  cardapio: ['app/menu/', 'app/api/menu/', 'components/modules/cardapio/'],
}

// ── O manifesto, lido do código ──────────────────────────────────────────────
const manifesto = ler('core/modulos.ts')
const ini = manifesto.indexOf('export const MODULOS')
const corpo = manifesto.slice(ini, manifesto.indexOf('\n]', ini))
const MODULOS = new Map() // chave → { href, tabelas[] }
for (const bloco of corpo.split(/\{\s*chave:/).slice(1)) {
  const chave = bloco.match(/^\s*'([a-z][a-z0-9_]*)'/)?.[1]
  const href = bloco.match(/href:\s*'([^']+)'/)?.[1]
  const tabelas = [...(bloco.match(/tabelas:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
  if (chave && href) MODULOS.set(chave, { href, tabelas })
}
if (MODULOS.size < 10) { console.error(`✗ check-segmento-modulo: li só ${MODULOS.size} módulos — o formato de core/modulos.ts mudou?`); process.exit(1) }
for (const s of SEGMENTOS) for (const d of s.donos) if (!MODULOS.has(d)) { console.error(`✗ check-segmento-modulo: dono '${d}' fora do manifesto`); process.exit(1) }
for (const d of Object.keys(ARQUIVOS)) if (!MODULOS.has(d)) { console.error(`✗ check-segmento-modulo: ARQUIVOS de '${d}', fora do manifesto`); process.exit(1) }

const menu = ler('lib/menu.ts')
const FERRAMENTA = new Map() // href do item → rota
for (const m of menu.matchAll(/href:\s*'([^']+)'[^}\n]*ferramenta:\s*\{\s*rota:\s*'([^']+)'/g)) FERRAMENTA.set(m[1], m[2])

/** As pastas/arquivos de cada módulo. */
const PASTAS = new Map()
for (const [chave, m] of MODULOS) {
  const h = m.href.replace(/^\//, '')
  const lista = [`app/(dashboard)/${h}/`, `app/api/${h}/`, `components/modules/${h}/`, ...(ARQUIVOS[chave] ?? [])]
  const f = FERRAMENTA.get(m.href)
  if (f) lista.push(`app/(dashboard)${f}/`)
  PASTAS.set(chave, lista)
}
const casa = (arq, p) => (p.endsWith('/') ? arq.startsWith(p) : arq === p)
function donosDoArquivo(arq) {
  const out = new Set()
  for (const [chave, lista] of PASTAS) if (lista.some((p) => casa(arq, p))) out.add(chave)
  return out
}

// ── O que a pessoa lê, num arquivo ───────────────────────────────────────────
function semComentarios(src) {
  let out = '', i = 0, q = null
  while (i < src.length) {
    const c = src[i], d = src[i + 1]
    if (q) {
      out += c
      if (c === '\\') { out += d ?? ''; i += 2; continue }
      if (c === q) q = null
      i++; continue
    }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') { const f = src.indexOf('*/', i + 2); i = f < 0 ? src.length : f + 2; out += ' '; continue }
    if (c === '"' || c === "'" || c === '`') q = c
    out += c; i++
  }
  return out
}
const CONSULTA = /\.(?:select|from|eq|neq|in|order|rpc|is|ilike|like|or|not|contains|gte|lte|gt|lt|filter|match|textSearch|storage\.from)\(\s*(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g
/** Textos legíveis: strings com maiúscula, acento ou espaço; e texto de JSX. */
function textos(src) {
  const s = semComentarios(src).replace(CONSULTA, '()').replace(/^\s*import[^\n]*$/gm, '').replace(/^\s*export\s+\*[^\n]*$/gm, '')
  const out = []
  const leg = (t) => /[A-ZÀ-Ý]|[à-ý]|\s/.test(t)
  for (const m of s.matchAll(/(['"])((?:\\.|(?!\1)[^\n])*)\1/g)) if (leg(m[2])) out.push(m[2])
  for (const m of s.matchAll(/`((?:\\.|[^`])*)`/g)) { const t = m[1].replace(/\$\{[^}]*\}/g, ' '); if (leg(t)) out.push(t) }
  for (const m of s.matchAll(/>([^<>{}`'"=;]+)</g)) if (/\p{L}{3}/u.test(m[1])) out.push(m[1])
  return out
}

function arquivos(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) { if (nome !== 'node_modules' && !nome.startsWith('.')) out.push(...arquivos(p)) }
    else if (/\.(ts|tsx|js|jsx|mjs|mts)$/.test(nome) && !/\.d\.ts$/.test(nome)) out.push(p)
  }
  return out
}

/**
 * OS REGISTROS DE MÓDULO: o manifesto, o catálogo do menu e o menu de Configurações. Cada módulo se
 * declara ali com o próprio nome ("Imóveis", "Cardápio"). Não é exceção: o texto é conferido POR
 * DECLARAÇÃO — no manifesto, cada `{ chave: 'x', ... }` é do módulo x; no menu, a linha com o `href`
 * (ou a rota da ferramenta) de um módulo é dele; em Configurações, a linha com `tem('<seção>')` é do
 * módulo que traz a seção. Texto de segmento fora dessas declarações reprova como em qualquer arquivo.
 */
const ABA_DO_MODULO = new Map()
for (const bloco of corpo.split(/\{\s*chave:/).slice(1)) {
  const chave = bloco.match(/^\s*'([a-z][a-z0-9_]*)'/)?.[1]
  for (const m of (bloco.match(/abasConfiguracoes:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([a-z-]+)'/g)) {
    if (!ABA_DO_MODULO.has(m[1])) ABA_DO_MODULO.set(m[1], new Set())
    ABA_DO_MODULO.get(m[1]).add(chave)
  }
}
const HREF_DO_MODULO = new Map([...MODULOS].map(([chave, m]) => [m.href, chave]))
for (const [href, rota] of FERRAMENTA) if (HREF_DO_MODULO.has(href)) HREF_DO_MODULO.set(rota, HREF_DO_MODULO.get(href))
/** [trecho, donos do trecho] de um arquivo de registro. */
function unidadesDoRegistro(arq, src) {
  if (arq === 'core/modulos.ts') {
    const i = src.indexOf('export const MODULOS'), f = src.indexOf('\n]', i)
    const partes = src.slice(i, f).split(/(?=\{\s*chave:)/)
    const fora = src.slice(0, i) + src.slice(f)
    return [[fora, new Set()], ...partes.map((p) => [p, new Set([p.match(/chave:\s*'([a-z0-9_]+)'/)?.[1]].filter(Boolean))])]
  }
  return src.split('\n').map((linha) => {
    const donos = new Set()
    for (const m of linha.matchAll(/'(\/[a-z0-9\-/]+)'/g)) if (HREF_DO_MODULO.has(m[1])) donos.add(HREF_DO_MODULO.get(m[1]))
    for (const m of linha.matchAll(/tem\('([a-z-]+)'\)/g)) for (const c of ABA_DO_MODULO.get(m[1]) ?? []) donos.add(c)
    return [linha, donos]
  })
}
const REGISTROS = new Set(['core/modulos.ts', 'lib/menu.ts', 'lib/configuracoes-menu.ts'])

const listar = process.argv.includes('--listar')
const erros = []
const todos = [...['app', 'components', 'lib', 'hooks', 'core'].flatMap((d) => arquivos(join(RAIZ, d))), join(RAIZ, 'proxy.ts')]
for (const abs of todos) {
  const arq = relative(RAIZ, abs).split('\\').join('/')
  const fonte = readFileSync(abs, 'utf8')
  const unidades = REGISTROS.has(arq) ? unidadesDoRegistro(arq, semComentarios(fonte)) : [[fonte, donosDoArquivo(arq)]]
  const achados = new Map()
  for (const [trecho, donos] of unidades) for (const t of textos(trecho)) {
    for (const seg of SEGMENTOS) {
      if (seg.donos.some((d) => donos.has(d))) continue
      for (const re of seg.termos) {
        const m = t.match(re)
        if (m) { const k = `${seg.nome}`; if (!achados.has(k)) achados.set(k, []); achados.get(k).push(t.trim().replace(/\s+/g, ' ').slice(0, 70)) }
      }
    }
  }
  for (const [seg, trechos] of achados) {
    const unicos = [...new Set(trechos)]
    erros.push({ arq, seg, n: unicos.length, ex: unicos.slice(0, listar ? 50 : 2) })
  }
}

// ── Tabelas sem dono ─────────────────────────────────────────────────────────
/** O core e a plataforma (05, "Como nasce um módulo": o core não se instala nem se tira). */
const CORE = new Set([
  'contatos', 'contato_identidades', 'contato_fusoes', 'negocios', 'negocio_historico', 'funis', 'funil_etapas', 'motivos_perda', 'itens',
  'conversas', 'mensagens', 'canais', 'chamadas', 'diagnostico_canais', 'historico_bruto', 'modelos_mensagem', 'modelos_mensagem_wabas',
  'tarefas', 'automacoes', 'automacao_execucoes', 'cadencias', 'cadencia_passos', 'cadencia_inscricoes', 'cadencia_execucoes',
  'distribuicao_regras', 'etiquetas', 'campos_personalizados', 'usuarios', 'empresa_usuarios', 'acessos', 'filiais', 'empresas',
  'empresa_branding', 'empresa_menu', 'empresa_dados_contrato', 'empresa_segredos', 'empresa_modulos', 'modulo_pedidos',
  'configuracoes_sistema', 'notificacao_prefs', 'push_subscriptions', 'metas', 'metas_comissoes', 'eventos', 'integracao_eventos',
  'assistente_config', 'assistente_uso', 'financeiro_taxas', 'importacoes', 'alertas_entrada', 'usuario_avisos',
  // plataforma
  'planos_config', 'precos_adicionais', 'stripe_eventos', 'avisos_plataforma', 'superadmin_logs', 'rate_limit', 'presets_onboarding', 'termos_aceites',
  'empresa_convites',
])
// As tabelas que EXISTEM: o tipo gerado do banco (types/database.gerado.ts, `npx supabase gen types --local`),
// bloco "public" → Tables. As migrações não servem de fonte: o corte renomeou tabelas por SQL dinâmico.
const tipos = ler('types/database.gerado.ts')
const iPub = tipos.indexOf('"public": {')
const bloco = tipos.slice(tipos.indexOf('Tables: {', iPub), tipos.indexOf('Views: {', iPub))
const vivas = new Set([...bloco.matchAll(/"([a-z_][a-z0-9_]*)": \{\r?\n\s*Row:/g)].map((m) => m[1]))
if (vivas.size < 50) { console.error(`✗ check-segmento-modulo: li só ${vivas.size} tabelas de types/database.gerado.ts — o formato mudou?`); process.exit(1) }
const tabelaDoModulo = new Map()
for (const [chave, m] of MODULOS) for (const t of m.tabelas) tabelaDoModulo.set(t, chave)
const prefixos = [...MODULOS].flatMap(([chave, m]) => [chave, m.href.replace(/^\//, '').replace(/-/g, '_')]).map((p) => p + '_')
const semDono = [...vivas].filter((t) => !t.startsWith('_') && !CORE.has(t) && !tabelaDoModulo.has(t) && !prefixos.some((p) => t.startsWith(p))).sort()

if (listar) {
  for (const e of erros) { console.log(`${e.arq}  [${e.seg}]`); for (const x of e.ex) console.log(`    ${x}`) }
  console.log(`\ntabelas sem dono: ${semDono.join(', ') || 'nenhuma'}`)
  console.log(`\n${erros.length} arquivo(s)×segmento com texto fora do módulo; ${semDono.length} tabela(s) sem dono`)
  process.exit(0)
}
if (erros.length || semDono.length) {
  console.error('✗ SEGMENTO SÓ DENTRO DO SEU MÓDULO:\n')
  for (const e of erros) console.error(`  TEXTO   ${e.arq}: ${e.seg} (${e.n}) — ex.: "${e.ex.join('" | "')}" — mova para um arquivo do módulo (ou torne genérico)`)
  for (const t of semDono) console.error(`  TABELA  ${t}: não é do core nem de um módulo — prefixo do módulo, ou \`tabelas\` no manifesto`)
  console.error(`\n  Sem lista de exceções. Ver o cabeçalho de scripts/check-segmento-modulo.mjs.`)
  process.exit(1)
}
console.log(`✓ segmento no módulo ok — ${todos.length} arquivos, ${vivas.size} tabelas; nenhum texto de segmento fora do módulo, nenhuma tabela sem dono`)
