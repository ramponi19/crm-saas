// CUSTO SÓ NOS SATÉLITES (etapa 1.1e, 26/11/2026; docs/etapa-1.1-plano.md §4.4).
//
// O app não lê nem grava mais as colunas antigas de custo: estoque_unidades.preco_custo/custo_reparo,
// vendas_vendas.valor_custo/lucro, compras_pedidos.valor_total, itens.custo. O custo mora nos satélites
// (estoque_unidades_custos, vendas_vendas_custos, compras_pedidos_custos), que só quem tem estoque.ver_custo lê.
//
// Como confere: em cada `.from('<tabela antiga>')` do app (app/, components/, lib/), olha a cadeia que vem depois
// (select, insert, update, upsert, order, filtros) até o fim da instrução e reprova:
//   - `select('*')` / `select(\`*, ...\`)` nessas tabelas (o `*` traz a coluna antiga);
//   - o nome de uma coluna antiga fora das junções dos satélites (`..._custos(...)`);
//   - insert/update/upsert com uma coluna antiga.
// Testes, scripts de volta e migrações ficam de fora (só app/, components/, lib/).
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ANTIGAS = {
  estoque_unidades: ['preco_custo', 'custo_reparo'],
  vendas_vendas: ['valor_custo', 'lucro'],
  compras_pedidos: ['valor_total'],
  itens: ['custo'],
}
// rastreados E os novos ainda não commitados (um arquivo novo não pode escapar da checagem)
const arquivos = [...new Set(execSync('git ls-files --cached --others --exclude-standard app components lib', { encoding: 'utf8' })
  .trim().split('\n'))].filter((f) => /\.(ts|tsx)$/.test(f))
// junção vinda de outra tabela com * numa tabela que tem coluna antiga (ex.: venda:vendas_vendas!venda_id(*))
const JUNCAO_ESTRELA = /\b(estoque_unidades|vendas_vendas|compras_pedidos|itens)(![a-z_]+)?\(\s*\*/

/**
 * A cadeia de chamadas que começa logo depois do `.from(...)`: segue enquanto houver parêntese, chave ou colchete
 * aberto (inclusive dentro de template de várias linhas) ou enquanto a linha seguinte começar com `.` (o projeto
 * não usa ponto e vírgula). Para na primeira quebra de linha fora disso.
 */
function cadeiaDe(src, inicio) {
  let prof = 0, i = inicio, aspas = null
  for (; i < src.length && i - inicio < 4000; i++) {
    const c = src[i]
    if (aspas) { if (c === '\\') { i++; continue } if (c === aspas) aspas = null; continue }
    if (c === "'" || c === '"' || c === '`') { aspas = c; continue }
    if ('([{'.includes(c)) prof++
    else if (')]}'.includes(c)) { if (prof === 0) break; prof-- }
    else if (c === '\n' && prof === 0) {
      const resto = src.slice(i + 1)
      if (!/^\s*\./.test(resto)) break
    }
  }
  return src.slice(inicio, i)
}

const achados = []
for (const f of arquivos) {
  const src = readFileSync(f, 'utf8')
  src.split('\n').forEach((l, i) => {
    if (JUNCAO_ESTRELA.test(l)) achados.push(`${f}:${i + 1}  junção com * em tabela que tem coluna antiga de custo`)
  })
  for (const [tabela, colunas] of Object.entries(ANTIGAS)) {
    const re = new RegExp(`\\.from\\(\\s*['"\`]${tabela}['"\`]\\s*(?:as never)?\\s*\\)`, 'g')
    let m
    while ((m = re.exec(src))) {
      let cadeia = cadeiaDe(src, m.index + m[0].length)
      // as junções dos satélites podem citar o nome das colunas (são as colunas NOVAS)
      cadeia = cadeia.replace(/[a-z_]*_custos\s*\([^)]*\)/g, '')
      const linha = src.slice(0, m.index).split('\n').length
      if (/\.select\(\s*['"`]\s*\*/.test(cadeia)) achados.push(`${f}:${linha}  ${tabela}: select('*') traz a coluna antiga de custo`)
      for (const c of colunas) {
        if (new RegExp(`\\b${c}\\b`).test(cadeia)) achados.push(`${f}:${linha}  ${tabela}.${c}: coluna antiga de custo`)
      }
    }
  }
}

if (achados.length) {
  console.error('✗ check-custo: o app ainda lê ou grava colunas antigas de custo (use os satélites e lib/custo.ts):')
  for (const a of achados) console.error(`  - ${a}`)
  process.exit(1)
}
console.log(`✓ custo ok — ${arquivos.length} arquivos; nenhuma leitura ou gravação das colunas antigas de custo`)
