#!/usr/bin/env node
/**
 * TRAVA DE DATAS — "que dia é" e "que horas são" só pela lib/datas.ts (10/11/2026).
 *
 * ══ O PROBLEMA QUE ISTO IMPEDE ═════════════════════════════════════════════
 *
 * O servidor roda em UTC; a loja, no fuso dela (Brasília por padrão). Um
 * `setHours(0,0,0,0)` ou `new Date(ano, mes, 1)` no servidor corta o dia às 21h de
 * Brasília; um `toLocaleTimeString()` sem `timeZone` mostra a hora +3h no servidor e
 * outra no navegador (erro #418). Em 09/11 eram ~40 pontos assim (06, seção 37): o
 * KPI "Hoje" zerava às 21h, a hora da visita saía +3h, o mês virava no dia 30 às 21h.
 * A regra: tudo pela lib/datas.ts, com o fuso da empresa explícito.
 *
 * ══ O QUE REPROVA ══════════════════════════════════════════════════════════
 *
 * Em app/, components/, lib/, core/ e hooks/ (menos a própria lib/datas.ts):
 *  - metodo-local   getDate/getDay/getMonth/getFullYear/getHours/getMinutes/getSeconds,
 *                   setHours/setDate/setMonth/setFullYear/setMinutes/setSeconds, toDateString
 *  - tolocale       toLocaleDateString/toLocaleTimeString sem `timeZone`; toLocaleString de
 *                   DATA (opções de dia/mês/hora, ou recebedor `new Date(...)`) sem `timeZone`
 *  - iso-como-dia   toISOString() cortado (slice/substring/split) como dia ou mês
 *  - date-local     new Date(ano, mes, ...) — o construtor de data local
 *  - fuso-fixo      o fuso escrito à mão ('America/Sao_Paulo' ou o deslocamento '-03:00' num
 *                   texto): certo para Brasília, errado para a empresa em outro fuso — use o
 *                   fuso da empresa (useFuso / fusoDaEmpresa) ou FUSO_PADRAO da lib
 * Em supabase/migrations/ a partir de 20261110 (SQL NOVO):
 *  - sql-sem-fuso   date_trunc, current_date, ::date ou localtime numa linha sem `at time zone`
 *
 * ══ EXCEÇÕES: A LISTA SÓ ENCOLHE ═══════════════════════════════════════════
 *
 * scripts/datas-excecoes.json: { "arquivo|regra": { "n": quantas, "motivo": "..." } }.
 * - ocorrência fora da lista = REPROVA (use a lib/datas; se for legítimo, entre na
 *   lista com o motivo);
 * - exceção com MENOS ocorrências do que a lista diz = REPROVA, pedindo para baixar o
 *   número (ou apagar a chave) — a folga não pode guardar lugar para um uso novo.
 *
 * `node scripts/check-datas.mjs --lista` imprime todas as ocorrências (com linha).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'
import ts from 'typescript'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')
const PASTAS = ['app', 'components', 'lib', 'core', 'hooks']
const PROPRIA = 'lib/datas.ts'
const SQL_DESDE = '20261110'

const METODOS_LOCAIS = new Set([
  'getDate', 'getDay', 'getMonth', 'getFullYear', 'getHours', 'getMinutes', 'getSeconds',
  'setHours', 'setDate', 'setMonth', 'setFullYear', 'setMinutes', 'setSeconds', 'toDateString',
])
const CHAVES_DE_DATA = new Set(['day', 'month', 'year', 'hour', 'minute', 'second', 'weekday', 'dateStyle', 'timeStyle', 'era'])

function arquivos(dir, fora = []) {
  let itens
  try { itens = readdirSync(dir) } catch { return fora }
  for (const n of itens) {
    if (n === 'node_modules' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) arquivos(p, fora)
    else if (/\.(ts|tsx|mts)$/.test(n) && !/\.d\.ts$/.test(n)) fora.push(p)
  }
  return fora
}

const rel = (p) => relative(RAIZ, p).split(sep).join('/')

/** O objeto de opções tem `timeZone`? Tem chave de data? (Spread de variável conta como "não sei": não reprova.) */
function lerOpcoes(arg) {
  if (!arg) return { fuso: false, data: false, opaco: false }
  if (!ts.isObjectLiteralExpression(arg)) return { fuso: false, data: false, opaco: true }
  let fuso = false, data = false, opaco = false
  for (const p of arg.properties) {
    if (ts.isSpreadAssignment(p)) { opaco = true; continue }
    const nome = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : ''
    if (nome === 'timeZone') fuso = true
    if (CHAVES_DE_DATA.has(nome)) data = true
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === 'timeZone') fuso = true
  }
  return { fuso, data, opaco }
}

function ehNewDate(n) {
  while (ts.isParenthesizedExpression(n)) n = n.expression
  return ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Date'
}

function varrerTs(caminho) {
  const texto = readFileSync(caminho, 'utf8')
  const sf = ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true, caminho.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const achados = []
  const linha = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const marcar = (regra, n) => achados.push({ regra, linha: linha(n), trecho: n.getText(sf).replace(/\s+/g, ' ').slice(0, 110) })

  function visitar(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const nome = n.expression.name.text
      const recebedor = n.expression.expression
      if (METODOS_LOCAIS.has(nome)) marcar('metodo-local', n)
      else if (nome === 'toLocaleDateString' || nome === 'toLocaleTimeString') {
        const o = lerOpcoes(n.arguments[1])
        if (!o.fuso && !o.opaco) marcar('tolocale', n)
      } else if (nome === 'toLocaleString') {
        const o = lerOpcoes(n.arguments[1])
        if (!o.fuso && !o.opaco && (o.data || ehNewDate(recebedor))) marcar('tolocale', n)
      } else if ((nome === 'slice' || nome === 'substring' || nome === 'substr' || nome === 'split')
        && ts.isCallExpression(recebedor) && ts.isPropertyAccessExpression(recebedor.expression)
        && recebedor.expression.name.text === 'toISOString') {
        marcar('iso-como-dia', n)
      }
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Date' && (n.arguments?.length ?? 0) >= 2) {
      marcar('date-local', n)
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && /^America\/Sao_Paulo$/.test(n.text)) marcar('fuso-fixo', n)
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n))
      && /T\d{2}:\d{2}(:\d{2})?-03:00|^:\d{2}-03:00|T00:00:00-03:00/.test(n.text)) marcar('fuso-fixo', n)
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return achados
}

function varrerSql(caminho) {
  const achados = []
  readFileSync(caminho, 'utf8').split(/\r?\n/).forEach((l, i) => {
    const codigo = l.replace(/--.*$/, '')
    if (/\bdate_trunc\s*\(|\bcurrent_date\b|::date\b|\blocaltime(stamp)?\b/i.test(codigo) && !/at\s+time\s+zone/i.test(codigo)) {
      achados.push({ regra: 'sql-sem-fuso', linha: i + 1, trecho: codigo.trim().slice(0, 110) })
    }
  })
  return achados
}

// ── Coleta ──────────────────────────────────────────────────────────────────
const porChave = new Map()
const detalhe = []
function somar(arquivo, achados) {
  for (const a of achados) {
    const k = `${arquivo}|${a.regra}`
    porChave.set(k, (porChave.get(k) ?? 0) + 1)
    detalhe.push({ arquivo, ...a })
  }
}
for (const pasta of PASTAS) {
  for (const p of arquivos(join(RAIZ, pasta))) {
    const r = rel(p)
    if (r === PROPRIA) continue
    somar(r, varrerTs(p))
  }
}
const MIG = join(RAIZ, 'supabase', 'migrations')
for (const n of readdirSync(MIG)) {
  if (!n.endsWith('.sql') || n.slice(0, 8) < SQL_DESDE) continue
  somar(`supabase/migrations/${n}`, varrerSql(join(MIG, n)))
}

if (process.argv.includes('--lista')) {
  for (const d of detalhe.sort((a, b) => a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha)) {
    console.log(`${d.arquivo}:${d.linha}  [${d.regra}]  ${d.trecho}`)
  }
  console.log(`\n${detalhe.length} ocorrência(s) em ${new Set(detalhe.map((d) => d.arquivo)).size} arquivo(s)`)
  process.exit(0)
}

// ── Comparação com a lista de exceções ──────────────────────────────────────
const excecoes = JSON.parse(readFileSync(join(AQUI, 'datas-excecoes.json'), 'utf8'))
const novas = [], folgas = []
for (const [k, n] of porChave) {
  const ex = excecoes[k]
  if (!ex) novas.push(`${k} (${n})`)
  else if (n > ex.n) novas.push(`${k} (${n}, a lista permite ${ex.n})`)
}
for (const [k, ex] of Object.entries(excecoes)) {
  const n = porChave.get(k) ?? 0
  if (n < ex.n) folgas.push(`${k}: agora ${n}, a lista diz ${ex.n} — baixe o número${n === 0 ? ' (apague a chave)' : ''}`)
}

if (novas.length || folgas.length) {
  if (novas.length) {
    console.error('\n✗ DATA FORA DA lib/datas — use o fuso da empresa (lib/datas.ts, useFuso / fusoDaEmpresa):\n')
    for (const x of novas) console.error('   ' + x)
    console.error('\n  Veja onde: node scripts/check-datas.mjs --lista')
  }
  if (folgas.length) {
    console.error('\n✗ A lista de exceções tem folga (ela só encolhe):\n')
    for (const x of folgas) console.error('   ' + x)
  }
  console.error('')
  process.exit(1)
}
const total = Object.values(excecoes).reduce((s, e) => s + e.n, 0)
console.log(`✓ datas ok — nenhum uso novo fora da lib/datas`)
console.log(`  exceções: ${total} ocorrência(s) em ${Object.keys(excecoes).length} chave(s) (só pode diminuir)`)
