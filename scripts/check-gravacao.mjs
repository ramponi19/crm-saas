#!/usr/bin/env node
/**
 * TRAVA DE GRAVAÇÃO — update/delete/upsert do app tem de conferir o resultado.
 *
 * ══ O PROBLEMA QUE ISTO IMPEDE ═════════════════════════════════════════════
 *
 * Com RLS, um UPDATE/DELETE que a política não deixa passar NÃO dá erro: afeta 0
 * linhas e o PostgREST responde 200. Em 04/11/2026 a justificativa da perda sumia
 * calada (contato de uma loja, negócio na outra) e a tela dizia "ok". A regra
 * (lib/linhas-afetadas.ts): toda gravação pede as linhas de volta — `.select(...)`
 * na mesma cadeia, ou `{ count: 'exact' }` — e a tela trata 0 como falha
 * (`nadaGravado`). Foram 134 chamadas assim levantadas em 04/11; esta trava impede
 * que voltem.
 *
 * ══ O QUE CONTA ════════════════════════════════════════════════════════════
 *
 * Toda cadeia `<cliente>.from(...)....update|delete|upsert(...)` em app/,
 * components/, lib/, core/ e hooks/, com o cliente da SESSÃO do usuário. Fica de
 * fora o cliente de serviço (sem RLS: 0 linhas só se o registro sumiu, e o código
 * de serviço não promete nada à tela): variável iniciada por createServiceClient()
 * no mesmo arquivo, ou chamada `svc`/`service`/`admin`/`serviceClient`. Conferida
 * = a cadeia tem `.select(` depois da gravação, ou as opções têm `count`.
 *
 * ══ EXCEÇÕES: A LISTA SÓ ENCOLHE ═══════════════════════════════════════════
 *
 * scripts/gravacao-excecoes.json: { "arquivo|tabela|op": { "n": quantas, "motivo": "..." } }.
 * Chave sem número de linha, para a lista não quebrar a cada edição do arquivo.
 * - gravação sem conferência que não está na lista = REPROVA (conserte ou, se o
 *   0 linhas for legítimo, entre na lista com o motivo);
 * - exceção que passou a ter MENOS chamadas do que a lista diz = REPROVA, pedindo
 *   para baixar o número (ou apagar a chave). Assim a lista não guarda folga para
 *   uma gravação nova entrar calada no lugar da consertada.
 *
 * `node scripts/check-gravacao.mjs --lista` imprime todas as gravações sem
 * conferência (com linha), dentro e fora da lista.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'
import ts from 'typescript'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')
const PASTAS = ['app', 'components', 'lib', 'core', 'hooks']
const OPS = new Set(['update', 'delete', 'upsert'])
const NOMES_DE_SERVICO = /^(svc|service|serviceClient|admin|adminClient)$/
const FABRICAS_DE_SERVICO = /^(createServiceClient|rastrDb)$/

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

/** Nomes de variável que recebem o cliente de serviço neste arquivo. */
function servicosDoArquivo(src) {
  const nomes = new Set()
  const visita = (n) => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name)) {
      let ini = n.initializer
      if (ts.isAwaitExpression(ini)) ini = ini.expression
      if (ts.isCallExpression(ini) && ts.isIdentifier(ini.expression) && FABRICAS_DE_SERVICO.test(ini.expression.text)) nomes.add(n.name.text)
    }
    ts.forEachChild(n, visita)
  }
  visita(src)
  return nomes
}

/** Sobe pela cadeia a partir da chamada da gravação: os métodos chamados depois dela. */
function depoisDaGravacao(call) {
  const nomes = []
  let n = call
  while (n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n && n.parent.parent && ts.isCallExpression(n.parent.parent)) {
    nomes.push(n.parent.name.text)
    n = n.parent.parent
  }
  return nomes
}

/** Desce pela cadeia antes da gravação: acha o `.from(...)` e o objeto em que ele foi chamado. */
function origem(call) {
  let e = call.expression.expression // o que vem antes de .update
  let tabela = null, cliente = null, temFrom = false, storage = false
  while (e) {
    if (ts.isCallExpression(e)) {
      const f = e.expression
      if (ts.isPropertyAccessExpression(f)) {
        if (f.name.text === 'from') {
          temFrom = true
          const a = e.arguments[0]
          tabela = a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : '?'
          cliente = f.expression
          if (ts.isPropertyAccessExpression(cliente) && cliente.name.text === 'storage') storage = true
          break
        }
        e = f.expression
        continue
      }
      break
    }
    if (ts.isPropertyAccessExpression(e)) { e = e.expression; continue }
    if (ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e) || ts.isNonNullExpression(e)) { e = e.expression; continue }
    break
  }
  return { temFrom, tabela, cliente, storage }
}

function nomeDoCliente(c) {
  if (!c) return '?'
  if (ts.isIdentifier(c)) return c.text
  if (ts.isPropertyAccessExpression(c)) return c.name.text
  if (ts.isCallExpression(c)) return (ts.isIdentifier(c.expression) ? c.expression.text : '?') + '()'
  if (ts.isAwaitExpression(c)) return nomeDoCliente(c.expression)
  if (ts.isParenthesizedExpression(c)) return nomeDoCliente(c.expression)
  return '?'
}

function opcoesComCount(call) {
  return call.arguments.some((a) => ts.isObjectLiteralExpression(a) && a.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === 'count'))
}

export function levantar() {
  const achados = []
  for (const pasta of PASTAS) {
    for (const arq of arquivos(join(RAIZ, pasta))) {
      const texto = readFileSync(arq, 'utf8')
      if (!/\.(update|delete|upsert)\(/.test(texto)) continue
      const src = ts.createSourceFile(arq, texto, ts.ScriptTarget.Latest, true, arq.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const servicos = servicosDoArquivo(src)
      const rel = relative(RAIZ, arq).split(sep).join('/')
      const visita = (n) => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && OPS.has(n.expression.name.text)) {
          const o = origem(n)
          if (o.temFrom && !o.storage) {
            const cli = nomeDoCliente(o.cliente)
            const deServico = (ts.isCallExpression(o.cliente) && FABRICAS_DE_SERVICO.test(cli.replace('()', ''))) || servicos.has(cli) || NOMES_DE_SERVICO.test(cli)
            if (!deServico) {
              const conferida = depoisDaGravacao(n).includes('select') || opcoesComCount(n)
              const linha = src.getLineAndCharacterOfPosition(n.getStart()).line + 1
              achados.push({ arquivo: rel, linha, tabela: o.tabela, op: n.expression.name.text, cliente: cli, conferida })
            }
          }
        }
        ts.forEachChild(n, visita)
      }
      visita(src)
    }
  }
  return achados
}

const chave = (a) => `${a.arquivo}|${a.tabela}|${a.op}`

function principal() {
  if (process.env.PULAR_TRAVA_GRAVACAO === '1') {
    console.log('\n⚠  trava de gravação IGNORADA por PULAR_TRAVA_GRAVACAO=1.\n')
    return 0
  }
  const achados = levantar()
  const sem = achados.filter((a) => !a.conferida)
  if (process.argv.includes('--lista')) {
    for (const a of sem) console.log(`${a.arquivo}:${a.linha}  ${a.op} ${a.tabela}  (${a.cliente})`)
    console.log(`\n${sem.length} sem conferência de ${achados.length} gravações com o cliente da sessão.`)
    return 0
  }
  const excecoes = JSON.parse(readFileSync(join(AQUI, 'gravacao-excecoes.json'), 'utf8'))
  const porChave = new Map()
  for (const a of sem) porChave.set(chave(a), [...(porChave.get(chave(a)) ?? []), a])
  const erros = []
  for (const [k, lista] of porChave) {
    const ex = excecoes[k]
    if (!ex) erros.push(`NOVA sem conferência: ${lista.map((a) => `${a.arquivo}:${a.linha}`).join(', ')} (${lista[0].op} ${lista[0].tabela}) — peça .select('id') e trate 0 linhas com nadaGravado(), ou entre em scripts/gravacao-excecoes.json com o motivo.`)
    else if (lista.length > ex.n) erros.push(`${k}: ${lista.length} chamadas sem conferência, a lista permite ${ex.n} — ${lista.map((a) => a.linha).join(', ')}.`)
    else if (lista.length < ex.n) erros.push(`${k}: agora são ${lista.length}, a lista diz ${ex.n} — BAIXE o número em scripts/gravacao-excecoes.json (a lista só encolhe).`)
  }
  for (const k of Object.keys(excecoes)) {
    if (!porChave.has(k)) erros.push(`${k}: não há mais chamada sem conferência — APAGUE a chave de scripts/gravacao-excecoes.json (a lista só encolhe).`)
  }
  if (erros.length) {
    console.error('\n✗ trava de gravação:\n  ' + erros.join('\n  ') + '\n')
    return 1
  }
  const total = Object.values(excecoes).reduce((s, e) => s + e.n, 0)
  console.log(`✓ gravação: ${achados.length - sem.length} conferidas; ${total} exceções na lista (${Object.keys(excecoes).length} chaves).`)
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(principal())
