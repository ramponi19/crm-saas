#!/usr/bin/env node
/**
 * TRAVA DE AVISOS — a contagem só pode cair.
 *
 * ══ O PROBLEMA QUE ISTO IMPEDE ═════════════════════════════════════════════
 *
 * Em 02/09/2026 a limpeza levou o ESLint de 226 avisos para 107. Sem trava,
 * daqui a um mês são 130 outra vez e ninguém percebe: aviso não quebra build,
 * não aparece em code review e cada um entra sozinho, um por commit.
 *
 * Foi o argumento do dono, e ele está certo: *"não usa? limpa"* — e limpar sem
 * travar é limpar de novo mais tarde, com mais dado e mais pressa.
 *
 * ══ POR QUE POR REGRA, E NÃO UM TOTAL ══════════════════════════════════════
 *
 * Um número só permite trocar dívida por dívida: consertar cinco imports
 * mortos e introduzir cinco `any` mantém o total e piora o código. Com teto por
 * regra, cada família responde por si.
 *
 * ══ POR QUE NÃO TRANSFORMAR EM ERRO ════════════════════════════════════════
 *
 * Tornar as regras `error` reprovaria o build por 107 problemas que já estavam
 * lá — e a equipe desligaria a regra no primeiro dia útil. Congelar o tamanho
 * do problema e obrigar a encolher é o que funcionou na trava de arquitetura
 * (scripts/check-nucleo.mjs), que saiu de 21 acoplamentos para zero.
 *
 * ══ QUANDO A CONTAGEM CAI ══════════════════════════════════════════════════
 *
 * O script AVISA e falha, pedindo para baixar o teto. Isso é de propósito: teto
 * que não acompanha a melhora deixa de proteger — a dívida podia voltar até o
 * número antigo sem ninguém notar.
 *
 * ══ EMERGÊNCIA ═════════════════════════════════════════════════════════════
 *
 * `PULAR_TRAVA_AVISOS=1 npm run build` passa por cima. Existe porque produção
 * parada é pior que aviso novo — mas o uso aparece no log, e a dívida continua
 * lá para ser paga.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const TETO = join(AQUI, 'avisos-congelados.json')

if (process.env.PULAR_TRAVA_AVISOS === '1') {
  console.log('\n⚠  trava de avisos IGNORADA por PULAR_TRAVA_AVISOS=1 — a dívida segue lá.\n')
  process.exit(0)
}

/**
 * Chama o ESLint pelo próprio Node, sem passar por `npx` nem por shell.
 *
 * Com `shell: true` o Node avisa que argumento não escapado abre brecha — e
 * ainda dependeria do `npx` estar no PATH do ambiente de build. Apontar para o
 * arquivo do pacote resolve os dois de uma vez.
 *
 * O ESLint sai com código 1 quando há ERRO; aviso não derruba. Nos dois casos o
 * JSON sai no stdout, então a exceção é lida em vez de propagada.
 */
function rodarEslint() {
  const raiz = join(AQUI, '..')
  const eslintJs = join(raiz, 'node_modules', 'eslint', 'bin', 'eslint.js')
  try {
    return execFileSync(process.execPath, [eslintJs, '.', '-f', 'json'], {
      cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    })
  } catch (e) {
    if (e.stdout) return e.stdout
    throw e
  }
}

const relatorio = JSON.parse(rodarEslint())

const atual = {}
let erros = 0
for (const arquivo of relatorio) {
  for (const m of arquivo.messages) {
    if (m.severity === 2) erros++
    const regra = m.ruleId ?? '(diretiva não usada)'
    atual[regra] = (atual[regra] ?? 0) + 1
  }
}

// Erro de lint nunca passa, teto ou não.
if (erros > 0) {
  console.error(`\n✗ ESLint reportou ${erros} ERRO(S). Erro não tem teto — conserte antes de subir.\n`)
  process.exit(1)
}

const teto = JSON.parse(readFileSync(TETO, 'utf8'))
const regras = [...new Set([...Object.keys(teto.regras), ...Object.keys(atual)])].sort()

const subiram = []
const cairam = []
for (const r of regras) {
  const permitido = teto.regras[r] ?? 0
  const agora = atual[r] ?? 0
  if (agora > permitido) subiram.push({ regra: r, permitido, agora })
  else if (agora < permitido) cairam.push({ regra: r, permitido, agora })
}

const total = Object.values(atual).reduce((s, n) => s + n, 0)

if (subiram.length) {
  console.error('\n✗ AVISO NOVO — a contagem subiu:\n')
  for (const { regra, permitido, agora } of subiram) {
    console.error(`   ${regra}: ${permitido} → ${agora}  (+${agora - permitido})`)
  }
  console.error(`
  Rode \`npx eslint .\` para ver onde. Duas saídas legítimas:

  1. Conserte o aviso novo — é o caminho normal.
  2. Se a regra estiver ERRADA no seu caso, suprima NA LINHA com o motivo
     escrito (\`// eslint-disable-next-line <regra>\`, com a explicação acima).
     Motivo escrito é decisão registrada; supressão muda não é.

  Subir o teto em scripts/avisos-congelados.json é o que este arquivo existe
  para evitar. Se for realmente necessário, diga no commit por quê.
`)
  process.exit(1)
}

if (cairam.length) {
  console.log('\n✓ dívida paga — baixe o teto em scripts/avisos-congelados.json:\n')
  for (const { regra, permitido, agora } of cairam) {
    console.log(`   "${regra}": ${agora},   ← estava ${permitido}  (-${permitido - agora})`)
  }
  if (process.env.ATUALIZAR_TETO === '1') {
    const novo = { ...teto, regras: Object.fromEntries(regras.map((r) => [r, atual[r] ?? 0]).filter(([, n]) => n > 0)), total, atualizado_em: new Date().toISOString().slice(0, 10) }
    writeFileSync(TETO, JSON.stringify(novo, null, 2) + '\n')
    console.log('  teto atualizado (ATUALIZAR_TETO=1).\n')
    process.exit(0)
  }
  console.log('  Ou rode `ATUALIZAR_TETO=1 node scripts/check-avisos.mjs` para baixar sozinho.\n')
  process.exit(1)
}

console.log(`\n✓ avisos ok — nenhum novo`)
console.log(`  teto congelado: ${total} avisos, 0 erros (só pode diminuir)\n`)
