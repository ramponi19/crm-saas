#!/usr/bin/env node
/**
 * Gera types/views-espelho.ts a partir da saída de supabase/testes/views_espelho.sql.
 *
 *   psql ... -X -A -t -f supabase/testes/views_espelho.sql | node scripts/tipos-espelho.mjs
 *
 * Por que existe: no core v1 as tabelas de módulo ganharam nome novo e o nome
 * antigo virou VIEW (`garantias_assistencias` = `select * from
 * assistencia_garantias`). O gerador do Supabase tipa view com toda coluna
 * anulável e fora de `Tables<>`, e 115 pontos do app quebravam — por um
 * detalhe do gerador, não por diferença real: a view tem as mesmas colunas e
 * as mesmas restrições da tabela. types/database.ts usa este mapa para tipar
 * cada view espelho como a tabela que ela espelha.
 */
import fs from 'node:fs'

const linhas = fs.readFileSync(0, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes('|'))
const pares = linhas.map((l) => l.split('|')).filter(([v, t]) => /^[a-z_][a-z0-9_]*$/.test(v) && /^[a-z_][a-z0-9_]*$/.test(t))
if (!pares.length) { console.error('nenhuma view espelho na entrada — nada gerado'); process.exit(1) }

const corpo = pares.map(([v, t]) => `  ${v}: '${t}'`).join('\n')
fs.writeFileSync('types/views-espelho.ts', `// GERADO por scripts/tipos-espelho.mjs a partir de supabase/testes/views_espelho.sql. Não editar.
// View de public -> tabela que ela espelha (mesmas colunas, mesma ordem).
export interface ViewsEspelho {
${corpo}
}
`)
console.log(`types/views-espelho.ts: ${pares.length} views espelho`)
