/**
 * O PAINEL CALCULADO UMA VEZ DÁ O MESMO QUE AS DUAS CONTAS DE ANTES (21/10/2026).
 *
 *   TESTE_URL=... TESTE_ANON=... TESTE_EMPRESA=1 TESTE_JWTS="dono=<jwt>,vendedor=<jwt>" \
 *     npx tsx scripts/comparar-painel-uma-vez.mts
 *
 * Contra a cópia. ANTES = a página (mês: produtos, canais, funil) + a rota
 * /api/dashboard (períodos, 12 meses, ranking, recentes, contagens), refeitas aqui
 * com as mesmas funções da lib. DEPOIS = `painelCompleto`. Sai com 1 se mudar algo.
 */
import { createClient } from '@supabase/supabase-js'
import { escopoDoUsuario } from '../lib/escopo'
import {
  painelCompleto, vendasDesde, vendasRecentes, contagensDoPainel, equipeEMetas,
  resultadoDasVendas, concluidas, inicioDosPeriodos, type ResultadoVendas,
} from '../lib/painel/metricas'

const url = process.env.TESTE_URL ?? ''
const anon = process.env.TESTE_ANON ?? ''
const empresaId = Number(process.env.TESTE_EMPRESA ?? 1)
const jwts = (process.env.TESTE_JWTS ?? '').split(',').filter(Boolean).map((p) => p.split('=') as [string, string])

function cliente(jwt: string) {
  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } })
  const getUser = db.auth.getUser.bind(db.auth)
  ;(db.auth as unknown as { getUser: () => ReturnType<typeof getUser> }).getUser = () => getUser(jwt)
  return db
}

async function antes(db: never) {
  const escopo = await escopoDoUsuario(db, empresaId)
  const starts = inicioDosPeriodos()
  const inicio12m = new Date(); inicio12m.setMonth(inicio12m.getMonth() - 12); inicio12m.setDate(1); inicio12m.setHours(0, 0, 0, 0)
  // Página
  const [vMes, recentesPagina, contagensPagina] = await Promise.all([
    vendasDesde(db, empresaId, escopo, starts.mes), vendasRecentes(db, empresaId, escopo, 6), contagensDoPainel(db, empresaId, escopo),
  ])
  const vendasMesPagina = concluidas(vMes)
  const pc: Record<string, number> = {}
  for (const v of vendasMesPagina) if (v.produto_nome) pc[v.produto_nome] = (pc[v.produto_nome] ?? 0) + 1
  const topProdutos = Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nome, qtd]) => ({ nome, qtd }))
  const porCanal: Record<string, number> = {}
  for (const v of vendasMesPagina) { const c = v.canal_venda ?? 'loja_fisica'; porCanal[c] = (porCanal[c] ?? 0) + 1 }
  // Rota
  const [vendas, recentes, contagens, { vendedores, metaPorUsuario }] = await Promise.all([
    vendasDesde(db, empresaId, escopo, inicio12m), vendasRecentes(db, empresaId, escopo, 6),
    contagensDoPainel(db, empresaId, escopo), equipeEMetas(db, empresaId, new Date().toISOString().slice(0, 7)),
  ])
  const fechadas = concluidas(vendas)
  const periods: Record<string, ResultadoVendas> = {}
  for (const [k, s] of Object.entries(starts)) periods[k] = resultadoDasVendas(fechadas.filter((v) => v.data_venda && new Date(v.data_venda).getTime() >= s.getTime()))
  const pm: Record<string, number> = {}
  for (const v of fechadas) { if (!v.data_venda) continue; const d = new Date(v.data_venda); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; pm[k] = (pm[k] ?? 0) + v.valor_venda }
  const faturamentoMensal = Object.entries(pm).map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes))
  const vendasMes = fechadas.filter((v) => v.data_venda && new Date(v.data_venda).getTime() >= starts.mes.getTime())
  const nomes = Object.fromEntries(vendedores.map((u) => [u.id, u.nome]))
  const st: Record<string, { nome: string; total: number; qtd: number; meta: number | null }> = {}
  for (const u of escopo.soMeu && escopo.userId ? vendedores.filter((u) => u.id === escopo.userId) : vendedores) st[u.id] = { nome: u.nome, total: 0, qtd: 0, meta: metaPorUsuario[u.id] ?? null }
  for (const v of vendasMes) { if (!v.vendedor_id) continue; st[v.vendedor_id] ??= { nome: nomes[v.vendedor_id] ?? 'Vendedor', total: 0, qtd: 0, meta: null }; st[v.vendedor_id].total += v.valor_venda; st[v.vendedor_id].qtd += 1 }
  const topVendedores = Object.entries(st).map(([id, s]) => ({ id, ...s })).filter((v) => v.total > 0).sort((a, b) => b.total - a.total).slice(0, 5)
  return { periods, faturamentoMensal, porCanal, topProdutos, topVendedores, vendasRecentes: recentes, contagens, _paginaIgualRota: JSON.stringify(recentesPagina) === JSON.stringify(recentes) && JSON.stringify(contagensPagina) === JSON.stringify(contagens) }
}

let dif = 0
for (const [quem, jwt] of jwts) {
  const db = cliente(jwt) as never
  const a = await antes(db)
  const escopo = await escopoDoUsuario(db, empresaId)
  const d = await painelCompleto(db, empresaId, escopo)
  const chaves = ['periods', 'faturamentoMensal', 'porCanal', 'topProdutos', 'topVendedores', 'vendasRecentes', 'contagens'] as const
  const diferentes = chaves.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(d[k]))
  dif += diferentes.length
  console.log(`${quem}: ${diferentes.length ? 'DIFERENTE em ' + diferentes.join(', ') : 'igual'} (receita do mês ${d.periods.mes.receita}, ${d.vendasRecentes.length} recentes, ${d.contagens.leadsAtivos} leads ativos; página e rota já batiam entre si: ${a._paginaIgualRota})`)
}
process.exit(dif ? 1 : 0)
