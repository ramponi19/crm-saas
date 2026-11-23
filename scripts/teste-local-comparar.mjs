// Compara o RESULTADO de um teste-*.sql com o esperado (scripts/teste-local.sh).
// Regra: cada chave do esperado tem de existir no resultado com o MESMO valor (objetos comparados por
// dentro, do mesmo jeito; chaves a mais no resultado são ignoradas). Imprime cada diferença.
//   node scripts/teste-local-comparar.mjs <esperado.json> '<json do resultado>'
import fs from 'node:fs'

const [arquivo, bruto] = process.argv.slice(2)
const esperado = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
let resultado
try { resultado = JSON.parse(bruto) } catch { console.log(`  FALHOU ${arquivo}: resultado não é JSON: ${String(bruto).slice(0, 200)}`); process.exit(1) }

const difs = []
function confere(esp, res, caminho) {
  if (esp !== null && typeof esp === 'object' && !Array.isArray(esp)) {
    if (res === null || typeof res !== 'object' || Array.isArray(res)) { difs.push(`${caminho}: esperado objeto, veio ${JSON.stringify(res)}`); return }
    for (const k of Object.keys(esp)) {
      if (!(k in res)) { difs.push(`${caminho}.${k}: faltou no resultado`); continue }
      confere(esp[k], res[k], `${caminho}.${k}`)
    }
    return
  }
  if (JSON.stringify(esp) !== JSON.stringify(res)) difs.push(`${caminho}: esperado ${JSON.stringify(esp)}, veio ${JSON.stringify(res)}`)
}
confere(esperado, resultado, '$')
if (difs.length) {
  console.log(`  FALHOU ${arquivo.replace(/^.*\//, '').replace('.json', '')}`)
  for (const d of difs) console.log(`    - ${d}`)
  process.exit(1)
}
