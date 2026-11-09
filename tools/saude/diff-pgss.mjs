// Delta do pg_stat_statements entre duas fotos. Uso: node diff-pgss.mjs antes.json depois.json [n]
// Cada foto: lista de {id, calls, lidos, temp, ms, q} (ver a consulta em LEIA-ME-fotos.md).
import fs from 'node:fs'
const ler = (f) => { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(j) ? j : (j.json_agg ?? j[0]?.json_agg ?? []) }
const [a, b, n = 10] = process.argv.slice(2)
const antes = new Map(ler(a).map((r) => [r.id, r]))
const linhas = ler(b).map((r) => { const o = antes.get(r.id) ?? { calls: 0, lidos: 0, temp: 0, ms: 0 }
  return { id: r.id, calls: r.calls - o.calls, lidos: r.lidos - o.lidos, temp: r.temp - o.temp, ms: r.ms - o.ms, q: r.q } })
  .filter((r) => r.calls > 0)
const top = (k) => [...linhas].sort((x, y) => y[k] - x[k]).slice(0, Number(n))
for (const k of ['temp', 'lidos', 'ms']) {
  console.log(`\n== top ${n} por ${k} (delta)`)
  for (const r of top(k)) console.log(`${String(r[k]).padStart(10)} | calls ${r.calls} | lidos ${r.lidos} | temp ${r.temp} (${(r.temp * 8 / 1024).toFixed(1)} MB) | ${Math.round(r.ms)} ms | ${r.q.slice(0, 120)}`)
}
