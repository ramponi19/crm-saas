#!/usr/bin/env node
/**
 * TRAVA DO FORMATO ANTIGO DE CONFIGURAÇÃO (1.1h parte 2, 26/11/2026; docs/etapa-1.1-plano.md §5.4).
 *
 * Desde a 1.1h a configuração do catálogo mora só em `empresa_config` (lerConfig / envelopesDaConfig / config_valor).
 * Reprova, em app/ lib/ components/ core/:
 *   - leitura ou escrita de `configuracoes_sistema` com chave do catálogo (`modulo.chave`) ou do formato antigo do
 *     horário (`horario_comercial`, `horario`);
 *   - o uso de CHAVE_HORARIO_ANTIGA;
 *   - `empresas.permissoes` (substituída pelos cargos na 1.1b; a coluna sai na H1c).
 * As chaves de `configuracoes_sistema` que não são do catálogo (roleta_leads, devolucao_esteira, fuso...) continuam.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PASTAS = ['app', 'lib', 'components', 'core']
const ANTIGAS = new Set(['horario_comercial', 'horario'])
function arquivos(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (n === 'node_modules' || n.startsWith('.')) continue
    if (statSync(p).isDirectory()) arquivos(p, out)
    else if (/\.(ts|tsx)$/.test(n)) out.push(p)
  }
  return out
}
const erros = []
for (const pasta of PASTAS) {
  for (const arq of arquivos(pasta)) {
    const linhas = readFileSync(arq, 'utf8').split(/\r?\n/)
    linhas.forEach((l, i) => {
      if (/^\s*(\/\/|\*)/.test(l)) return
      if (/CHAVE_HORARIO_ANTIGA/.test(l) && !arq.split('\\').join('/').endsWith('lib/horario.ts')) erros.push(`${arq}:${i + 1} usa CHAVE_HORARIO_ANTIGA`)
      if (/from\(['"]empresas['"]\)[^\n]*select\([^)]*\bpermissoes\b/.test(l) || /\bpermissoes:\s*clean\b/.test(l)) erros.push(`${arq}:${i + 1} lê/grava empresas.permissoes`)
      if (!/configuracoes_sistema/.test(l)) return
      // a chave pode vir na mesma linha ou nas duas seguintes (cadeia do PostgREST quebrada em linhas)
      const trecho = [l, linhas[i + 1] ?? '', linhas[i + 2] ?? ''].join(' ')
      for (const m of trecho.matchAll(/(?:eq\(\s*['"]chave['"]\s*,|chave:)\s*['"]([^'"]+)['"]/g)) {
        const k = m[1]
        if (/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(k) || ANTIGAS.has(k)) erros.push(`${arq}:${i + 1} configuracoes_sistema com a chave '${k}'`)
      }
      for (const m of trecho.matchAll(/in\(\s*['"]chave['"]\s*,\s*\[([^\]]*)\]/g)) {
        for (const k of [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1])) {
          if (/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(k) || ANTIGAS.has(k)) erros.push(`${arq}:${i + 1} configuracoes_sistema com a chave '${k}'`)
        }
      }
    })
  }
}
if (erros.length) {
  console.error(`✗ config antiga: ${erros.length} uso(s) do formato antigo de configuração:\n  ` + [...new Set(erros)].join('\n  '))
  process.exit(1)
}
console.log('✓ config antiga ok — nenhuma leitura de configuracoes_sistema com chave do catálogo ou do horário antigo')
