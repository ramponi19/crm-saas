#!/usr/bin/env node
/**
 * TRAVA DO PAPEL LEGADO (etapa 1.1b, 25/11/2026; roteiro §2 "E1.6 Fim do papel legado").
 *
 * Desde a 1.1b o CARGO decide e o papel (empresa_usuarios.role: owner/admin/vendedor/tecnico) é derivado dele por
 * gatilho, para as checagens antigas continuarem certas sem trocar tudo de uma vez. Esta trava conta as checagens
 * de papel no código e SÓ deixa o número cair: cada etapa que mexe numa tela troca a checagem por permissão
 * (lib/sessao.ts: exigirPermissao / temPermissao). Na E1.6 o número chega a zero e a coluna role sai.
 *
 *   node scripts/check-papel.mjs           confere contra scripts/papel-congelado.json
 *   node scripts/check-papel.mjs --gravar  grava o número atual (só para baixar o teto)
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PADROES = [
  /requireEmpresaRole(Api)?\(/g,
  /requireOwnerOrAdminApi\(/g,
  /getEmpresaRole\(/g,
  /useSouAdmin\(/g,
  /role\s*===\s*'(owner|admin|vendedor|tecnico)'/g,
  /papel\s*===\s*'(owner|admin|vendedor|tecnico)'/g,
  /\[\s*'owner'\s*,\s*'admin'\s*\]/g,
  /\.in\(\s*'role'/g,
  /is_empresa_admin/g,
]
const PASTAS = ['app', 'lib', 'components', 'core']
const ARQ = 'scripts/papel-congelado.json'

function arquivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (n === 'node_modules' || n.startsWith('.')) continue
    if (statSync(p).isDirectory()) arquivos(p, out)
    else if (/\.(ts|tsx)$/.test(n)) out.push(p)
  }
  return out
}

let total = 0
const porArquivo = {}
for (const d of PASTAS) {
  for (const f of arquivos(d)) {
    if (f.endsWith(join('lib', 'owner.ts'))) continue   // a definição dos helpers, não um uso
    const txt = readFileSync(f, 'utf8')
    let n = 0
    for (const re of PADROES) n += (txt.match(re) ?? []).length
    if (n) { porArquivo[f.replaceAll('\\', '/')] = n; total += n }
  }
}

if (process.argv.includes('--gravar')) {
  writeFileSync(ARQ, JSON.stringify({ total, arquivos: Object.keys(porArquivo).length }, null, 2) + '\n')
  console.log(`✓ papel congelado em ${total} checagens (${Object.keys(porArquivo).length} arquivos)`)
  process.exit(0)
}

const teto = JSON.parse(readFileSync(ARQ, 'utf8')).total
if (total > teto) {
  console.error(`✗ papel: ${total} checagens de papel, teto ${teto}. Checagem nova de papel não entra: use permissão (lib/sessao.ts).`)
  process.exit(1)
}
console.log(`✓ papel ok — ${total} checagens de papel em ${Object.keys(porArquivo).length} arquivos (teto ${teto}; só pode diminuir até a E1.6)`)
if (total < teto) console.log(`  caiu ${teto - total}: rode node scripts/check-papel.mjs --gravar para baixar o teto`)
