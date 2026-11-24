// C6 — SIMULAÇÃO DA ATIVAÇÃO DO PÓS-VENDA POR RESPONSÁVEL (SÓ LEITURA; nada é gravado, nada é ligado).
//
// Quantos passos cada vendedor e cada administrador recebe, por semana, nos próximos 3 meses e no pico
// (jun–out/2027), com as regras que estão no banco (C2/C3, docs/design-pos-venda.md §2.3, §8.8 e D9):
//   - régua "Aparelhos" (categorias de aparelho): D+1, D+7 (NPS), D+30, D+90 (só seminovo), D+330;
//     tudo o mais (sem venda, sem categoria ou categoria sem régua) cai na régua "Geral": D+7 (NPS), D+330;
//   - passo cuja data já passou na ativação não nasce; recompra da mesma categoria cancela os passos
//     "do aparelho" (D+90, D+330) pendentes da compra anterior; passo igual do mesmo cliente no mesmo dia junta;
//   - responsável (D9): vendedor ATIVO do negócio (cargo vendedor, não ausente) → senão roleta dos vendedores
//     ativos da loja (vendedor sem loja conta como da matriz; ordem por usuario_id, contador por loja) → loja sem
//     vendedor: roleta dos administradores (dono só se não houver admin);
//   - teto diário por responsável (padrão 25): cliente do próprio vendedor vai para o dia útil seguinte dele;
//     passo da roleta vai para o próximo da roleta com vaga; todos cheios → dia útil seguinte (seg–sex);
//   - administradores: NPS até 6 (suposição: NPS_BAIXO = 10% dos D+7, 2 dias depois, roleta dos admins).
//     Chamados não entram (não há base para estimar).
// Vendas NOVAS (projeção): repete, semana a semana, as vendas das 8 semanas cheias antes da ativação, com a
// mesma loja, categoria, condição e responsável (cliente novo a cada venda: sem recompra nem junção).
//
// Uso (lê a produção com a chave de serviço do ambiente; não grava nada):
//   node --env-file="D:/Empresa TI/CRM-SaaS/.env.local" scripts/posvenda/simular-responsaveis.mjs [ativacao=AAAA-MM-DD] [saida.json]
// A saída tem nomes da equipe: fica FORA do git (pasta de rascunho ou conciliacao-pedidos/).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const EMPRESA = 1
const FUSO_MS = 3 * 3600e3
const TETO = 25
const NPS_BAIXO = 0.10
const APARELHOS = new Set([1, 2, 3, 4]) // iPhone/Smartphone, iPad, MacBook, Watch/Smartwatch (categorias da JM)
const REGUA_APARELHOS = [
  { p: 'D+1', d: 1, tipo: 'whatsapp', grupo: 'relacionamento' },
  { p: 'D+7 NPS', d: 7, tipo: 'nps', grupo: 'relacionamento' },
  { p: 'D+30', d: 30, tipo: 'whatsapp', grupo: 'relacionamento' },
  { p: 'D+90 bateria', d: 90, tipo: 'whatsapp', grupo: 'aparelho', so: 'seminovo' },
  { p: 'D+330 troca', d: 330, tipo: 'ligacao', grupo: 'aparelho' },
]
const REGUA_GERAL = [
  { p: 'D+7 NPS', d: 7, tipo: 'nps', grupo: 'relacionamento' },
  { p: 'D+330 troca', d: 330, tipo: 'ligacao', grupo: 'aparelho' },
]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !chave) throw new Error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente')
const sb = createClient(url, chave, { auth: { persistSession: false } })

const dia = (iso) => new Date(Date.parse(iso) - FUSO_MS).toISOString().slice(0, 10)
const somar = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const dow = (d) => new Date(d + 'T12:00:00Z').getUTCDay() // 0 dom … 6 sáb
const segunda = (d) => somar(d, -((dow(d) + 6) % 7))
const util = (d) => dow(d) >= 1 && dow(d) <= 5
const proxUtil = (d) => { let x = somar(d, 1); while (!util(x)) x = somar(x, 1); return x }

const ATIVACAO = (process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])) ? process.argv[2] : dia(new Date().toISOString())
const SAIDA = process.argv.find((a) => a.endsWith('.json'))
const FIM = '2027-10-31'

// ── leitura ──
async function todos(q) {
  const out = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q().range(de, de + 999)
    if (error) throw error
    out.push(...data); if (data.length < 1000) return out
  }
}
const funis = await todos(() => sb.from('funis').select('id, interno').eq('empresa_id', EMPRESA).order('id'))
const interno = new Set(funis.filter((f) => f.interno).map((f) => f.id))
const ganhos = (await todos(() => sb.from('negocios').select('id, contato_id, filial_id, funil_id, responsavel_id, ganho_em, dados')
  .eq('empresa_id', EMPRESA).eq('status', 'ganho').order('id')))
  .filter((g) => !interno.has(g.funil_id) && g.ganho_em)
const equipe = await todos(() => sb.from('empresa_usuarios').select('usuario_id, role, ativo, ausente, filial_id').eq('empresa_id', EMPRESA).order('usuario_id'))
const { data: us } = await sb.from('usuarios').select('id, nome').in('id', equipe.map((e) => e.usuario_id))
const nome = Object.fromEntries((us ?? []).map((u) => [u.id, (u.nome ?? u.id).trim()]))
const { data: lojas } = await sb.from('filiais').select('id, nome, matriz').eq('empresa_id', EMPRESA).eq('ativo', true).order('id')
const matriz = (lojas ?? []).find((l) => l.matriz)?.id ?? null

// Cenário: `excluir=<uuid>,<uuid>` tira usuários da equipe ativa (ex.: uma conta que não é gente), como se
// estivessem desativados antes da ativação.
const EXCLUIR = new Set((process.argv.find((a) => a.startsWith('excluir=')) ?? 'excluir=').slice(8).split(',').filter(Boolean))
const ativos = equipe.filter((e) => e.ativo && !EXCLUIR.has(e.usuario_id))
const vendedorAtivo = new Set(ativos.filter((e) => e.role === 'vendedor' && !e.ausente).map((e) => e.usuario_id))
const vendedoresDaLoja = (loja) => ativos.filter((e) => e.role === 'vendedor' && !e.ausente
  && ((lojas ?? []).length < 2 || e.filial_id === loja || (e.filial_id == null && loja === matriz))).map((e) => e.usuario_id).sort()
const admins = (() => { const a = ativos.filter((e) => e.role === 'admin').map((e) => e.usuario_id).sort(); return a.length ? a : ativos.filter((e) => e.role === 'owner').map((e) => e.usuario_id).sort() })()

// ── responsável com teto (D9) ──
const carga = new Map() // `${usuario}|${dia}` → n
const cheio = (u, d) => (carga.get(`${u}|${d}`) ?? 0) >= TETO
const contador = new Map() // roleta → próximo índice
const estouros = { vendedor_dia_seguinte: 0, roleta_outro: 0, roleta_dia_seguinte: 0 }
function roleta(chaveRoleta, cands, d) {
  let n = 0, dd = d
  while (true) {
    const i0 = contador.get(chaveRoleta) ?? 0
    for (let k = 0; k < cands.length; k++) {
      const u = cands[(i0 + k) % cands.length]
      if (!cheio(u, dd)) {
        contador.set(chaveRoleta, (i0 + k + 1) % cands.length)
        if (k > 0) estouros.roleta_outro++
        if (dd !== d) estouros.roleta_dia_seguinte++
        return { u, d: dd, origem: chaveRoleta.startsWith('admin') ? 'administradores' : 'roleta' }
      }
    }
    dd = proxUtil(dd); if (++n > 60) throw new Error('roleta sem vaga')
  }
}
function responsavel(g, d, tipo) {
  if (tipo === 'admin') return roleta('admin', admins, d)
  if (g.responsavel_id && vendedorAtivo.has(g.responsavel_id)) {
    let dd = d
    while (cheio(g.responsavel_id, dd)) { dd = proxUtil(dd); estouros.vendedor_dia_seguinte++ }
    return { u: g.responsavel_id, d: dd, origem: 'vendedor' }
  }
  const vs = vendedoresDaLoja(g.filial_id)
  return vs.length ? roleta(`loja:${g.filial_id}`, vs, d) : roleta('admin', admins, d)
}

// ── materializa ──
const passos = [] // { u, d, p, origem, fonte }
const juntados = new Set()
const resumo = { ganhos_base: ganhos.length, jornadas_base: 0, passos_base: 0, juntados: 0, cancelados_recompra: 0, projetadas: 0, passos_projecao: 0 }
const catDe = (g) => (g.dados?.venda && typeof g.dados.venda.categoria_id === 'number') ? g.dados.venda.categoria_id : null
const condDe = (g) => g.dados?.venda?.condicao ?? null

// recompra: para cada (contato, categoria de aparelho), as datas das compras
const comprasDoCliente = new Map()
for (const g of ganhos) {
  const c = catDe(g); if (!c || !APARELHOS.has(c) || !g.contato_id) continue
  const k = `${g.contato_id}|${c}`; comprasDoCliente.set(k, [...(comprasDoCliente.get(k) ?? []), { id: g.id, d: dia(g.ganho_em) }])
}
const recompraAntes = (g, d0, dPasso) => {
  const c = catDe(g); if (!c || !APARELHOS.has(c)) return false
  return (comprasDoCliente.get(`${g.contato_id}|${c}`) ?? []).some((x) => x.id !== g.id && (x.d > d0 || (x.d === d0 && x.id > g.id)) && x.d <= dPasso)
}

function materializar(g, d0, fonte, hoje) {
  const c = catDe(g), regua = c && APARELHOS.has(c) ? REGUA_APARELHOS : REGUA_GERAL
  let criou = 0
  for (const s of regua) {
    if (s.so && s.so !== condDe(g)) continue
    const dp = somar(d0, s.d)
    if (dp < hoje || dp > FIM) continue
    if (fonte === 'base' && s.grupo === 'aparelho' && recompraAntes(g, d0, dp)) { resumo.cancelados_recompra++; continue }
    if (fonte === 'base' && g.contato_id) {
      const kj = `${g.contato_id}|${dp}|${s.tipo}`
      if (juntados.has(kj)) { resumo.juntados++; continue }
      juntados.add(kj)
    }
    const r = responsavel(g, dp, 'acomp')
    carga.set(`${r.u}|${r.d}`, (carga.get(`${r.u}|${r.d}`) ?? 0) + 1)
    passos.push({ u: r.u, d: r.d, p: s.p, origem: r.origem, fonte })
    criou++
    if (s.tipo === 'nps') passos.push({ npsBaixo: true, d: somar(dp, 2), fonte })
  }
  return criou
}

// 1. base: as vendas que já existem, em ordem de ganho (como a ativação faria)
for (const g of [...ganhos].sort((a, b) => a.ganho_em.localeCompare(b.ganho_em) || a.id - b.id)) {
  const n = materializar(g, dia(g.ganho_em), 'base', ATIVACAO)
  if (n) { resumo.jornadas_base++; resumo.passos_base += n }
}
// 2. projeção: as 8 semanas cheias antes da ativação, repetidas até o fim do pico
const seg0 = segunda(ATIVACAO), janelaIni = somar(seg0, -56)
const janela = ganhos.filter((g) => { const d = dia(g.ganho_em); return d >= janelaIni && d < seg0 })
const novas = []
for (let k = 0; ; k++) {
  const desloc = 56 * (k + 1)
  const lote = janela.map((g) => ({ ...g, contato_id: null, _d: somar(dia(g.ganho_em), desloc) })).filter((g) => g._d >= ATIVACAO && g._d <= FIM)
  if (!lote.length && somar(janelaIni, desloc) > FIM) break
  novas.push(...lote)
}
for (const g of novas.sort((a, b) => a._d.localeCompare(b._d))) { resumo.projetadas++; resumo.passos_projecao += materializar(g, g._d, 'projecao', g._d) }
// 3. NPS baixo → administradores (fração fixa, distribuída de forma determinística)
let acum = 0
for (const x of passos.filter((x) => x.npsBaixo).sort((a, b) => a.d.localeCompare(b.d))) {
  acum += NPS_BAIXO; if (acum < 1) continue; acum -= 1
  const r = responsavel(null, x.d, 'admin'); carga.set(`${r.u}|${r.d}`, (carga.get(`${r.u}|${r.d}`) ?? 0) + 1)
  passos.push({ u: r.u, d: r.d, p: 'NPS baixo', origem: r.origem, fonte: x.fonte })
}
const reais = passos.filter((x) => !x.npsBaixo)

// ── agregação por semana e responsável ──
const rotulo = (u) => {
  const e = equipe.find((x) => x.usuario_id === u)
  const loja = e?.filial_id ? (lojas.find((l) => l.id === e.filial_id)?.nome ?? `loja ${e.filial_id}`) : (e?.role === 'vendedor' ? 'sem loja (matriz)' : 'todas')
  return `${nome[u] ?? u} — ${e?.role ?? '?'} — ${loja}`
}
function periodo(ini, fim) {
  const semanas = []; for (let s = segunda(ini); s <= fim; s = somar(s, 7)) semanas.push(s)
  const pessoas = {}
  for (const x of reais) {
    if (x.d < ini || x.d > fim) continue
    const s = segunda(x.d), r = rotulo(x.u)
    pessoas[r] ??= { _u: x.u, total: 0, base: 0, projecao: 0, semanas: Object.fromEntries(semanas.map((w) => [w, 0])), maior_dia: 0, por_passo: {}, por_origem: {} }
    const p = pessoas[r]
    p.total++; p[x.fonte]++; p.semanas[s]++; p.por_passo[x.p] = (p.por_passo[x.p] ?? 0) + 1; p.por_origem[x.origem] = (p.por_origem[x.origem] ?? 0) + 1
  }
  for (const p of Object.values(pessoas)) {
    const v = Object.values(p.semanas)
    p.media_semana = +(p.total / semanas.length).toFixed(1); p.maior_semana = Math.max(...v)
    const u = p._u; delete p._u
    p.maior_dia = Math.max(0, ...[...carga.entries()].filter(([k]) => k.startsWith(u + '|') && k.split('|')[1] >= ini && k.split('|')[1] <= fim).map(([, n]) => n))
  }
  const total_semana = Object.fromEntries(semanas.map((w) => [w, Object.values(pessoas).reduce((a, p) => a + p.semanas[w], 0)]))
  return { de: ini, ate: fim, semanas: semanas.length, total: reais.filter((x) => x.d >= ini && x.d <= fim).length, total_semana, pessoas }
}

const res = {
  ativacao: ATIVACAO, teto_diario: TETO, nps_baixo: NPS_BAIXO, excluidos: [...EXCLUIR].map((u) => nome[u] ?? u),
  equipe: { roleta_por_loja: Object.fromEntries((lojas ?? []).map((l) => [l.nome, vendedoresDaLoja(l.id).map((u) => nome[u] ?? u)])), administradores: admins.map((u) => nome[u] ?? u) },
  janela_projecao: { de: janelaIni, ate: somar(seg0, -1), vendas: janela.length, por_semana: +(janela.length / 8).toFixed(1) },
  resumo, estouros_de_teto: estouros,
  proximos_3_meses: periodo(ATIVACAO, somar(seg0, 7 * 13 - 1)),
  pico_jun_out_2027: periodo('2027-06-01', '2027-10-31'),
}
if (SAIDA) fs.writeFileSync(SAIDA, JSON.stringify(res, null, 1))
console.log(JSON.stringify({ ...res, proximos_3_meses: { ...res.proximos_3_meses, pessoas: undefined }, pico_jun_out_2027: { ...res.pico_jun_out_2027, pessoas: undefined } }, null, 1))
for (const k of ['proximos_3_meses', 'pico_jun_out_2027']) {
  console.log(`\n== ${k} ==`)
  for (const [r, p] of Object.entries(res[k].pessoas).sort((a, b) => b[1].total - a[1].total))
    console.log(`${r}: total ${p.total} (base ${p.base}, novas ${p.projecao}) · média/semana ${p.media_semana} · maior semana ${p.maior_semana} · maior dia ${p.maior_dia} · ${JSON.stringify(p.por_passo)} · ${JSON.stringify(p.por_origem)}`)
}
