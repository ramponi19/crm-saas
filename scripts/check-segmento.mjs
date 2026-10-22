#!/usr/bin/env node
/**
 * ZERO-SEGMENTO (22/10/2026): a palavra "segmento" não entra em código novo.
 *
 * Varre app/, components/ e lib/ (maiúsculas e minúsculas: Segmento, SEGMENTOS,
 * normalizarSegmento...). Arquivo que cita a palavra tem de estar na lista de
 * exceções (scripts/segmento-excecoes.json), com o motivo e um teto de ocorrências:
 *
 *   presets_onboarding  o adaptador do preset de onboarding — o único lugar que
 *                       vai conhecer a palavra quando a viagem terminar;
 *   register            o cadastro (/register), que escolhe o preset;
 *   inventario          herdado: citado no 03-INVENTARIO-CODIGO.md, sai na viagem
 *                       (Parte 4, item zero do 05).
 *
 * O build reprova quando:
 *   - um arquivo FORA da lista passa a citar a palavra (a lista não cresce);
 *   - um arquivo da lista passa do teto (o que é herdado não piora);
 *   - um arquivo da lista não cita mais a palavra, ou sumiu — tire da lista
 *     (a lista só encolhe, e quem limpou registra isso).
 *
 *   node scripts/check-segmento.mjs            confere (entra no npm run build)
 *   node scripts/check-segmento.mjs --baixar   reescreve os tetos para as contagens de hoje,
 *                                              SÓ para baixo (nunca sobe, nunca inclui arquivo)
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = process.cwd()
const PASTAS = ['app', 'components', 'lib']
const ARQ_EXCECOES = join(RAIZ, 'scripts', 'segmento-excecoes.json')
const PALAVRA = /segmento/gi
const EXTENSOES = /\.(ts|tsx|js|jsx|mjs|cjs|mts)$/

function arquivos(dir) {
  const out = []
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    const st = statSync(p)
    if (st.isDirectory()) { if (nome !== 'node_modules' && !nome.startsWith('.')) out.push(...arquivos(p)) }
    else if (EXTENSOES.test(nome)) out.push(p)
  }
  return out
}

const contagem = new Map()
for (const pasta of PASTAS) {
  if (!existsSync(join(RAIZ, pasta))) continue
  for (const p of arquivos(join(RAIZ, pasta))) {
    const n = (readFileSync(p, 'utf8').match(PALAVRA) ?? []).length
    if (n > 0) contagem.set(relative(RAIZ, p).split('\\').join('/'), n)
  }
}

const excecoes = JSON.parse(readFileSync(ARQ_EXCECOES, 'utf8'))
const lista = excecoes.arquivos

if (process.argv.includes('--baixar')) {
  let baixou = 0
  for (const [arq, e] of Object.entries(lista)) {
    const n = contagem.get(arq) ?? 0
    if (n > 0 && n < e.teto) { e.teto = n; baixou++ }
  }
  writeFileSync(ARQ_EXCECOES, JSON.stringify(excecoes, null, 2) + '\n')
  console.log(`tetos baixados em ${baixou} arquivo(s); nenhum subiu, nenhum entrou`)
  process.exit(0)
}

const erros = []
for (const [arq, n] of contagem) {
  const e = lista[arq]
  if (!e) erros.push(`NOVO     ${arq}: ${n} ocorrência(s) de "segmento" — código novo pergunta "o módulo está ligado?" (lib/empresa-config.ts → ligadosDaEmpresa), não o segmento`)
  else if (n > e.teto) erros.push(`SUBIU    ${arq}: ${e.teto} → ${n} (${e.motivo})`)
}
for (const [arq, e] of Object.entries(lista)) {
  if (!contagem.has(arq)) erros.push(`LIMPO    ${arq}: não cita mais "segmento" (ou sumiu) — tire de scripts/segmento-excecoes.json (${e.motivo})`)
}

const total = [...contagem.values()].reduce((s, n) => s + n, 0)
const porMotivo = {}
for (const e of Object.values(lista)) porMotivo[e.motivo] = (porMotivo[e.motivo] ?? 0) + 1
if (erros.length) {
  console.error('✗ ZERO-SEGMENTO:\n')
  for (const e of erros) console.error('  ' + e)
  console.error(`\n  A lista de exceções só encolhe. Ver o cabeçalho de scripts/check-segmento.mjs.`)
  process.exit(1)
}
console.log(`✓ segmento ok — ${contagem.size} arquivos na lista (${Object.entries(porMotivo).map(([m, n]) => `${m} ${n}`).join(', ')}), ${total} ocorrências; nenhuma fora dela`)
