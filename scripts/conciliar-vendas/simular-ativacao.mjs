// Simulação da ATIVAÇÃO do módulo Pós-venda sobre as vendas que já existem (SÓ LEITURA).
// Regra do Lucas (23/11/2026): venda antiga nunca recebe passo cuja data já passou; só os passos que ainda
// caem de hoje em diante, contados a partir do ganho_em. Mostra jornadas e passos por categoria e por mês.
//
// Uso: node --env-file=.env.local simular-ativacao.mjs <venda_categoria_simulacao.csv>
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [SIM] = process.argv.slice(2)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EMPRESA = 1
const FUSO_MS = 3 * 3600e3
const dia = (iso) => new Date(Date.parse(iso) - FUSO_MS).toISOString().slice(0, 10)
const somar = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const HOJE = dia(new Date().toISOString())

// Régua semeada no MVP (docs/design-pos-venda.md §2.3): "iPhone e aparelhos Apple", categorias 1-4.
const REGUA_APARELHOS = [
  { passo: 'D+1 entrega', d: 1 }, { passo: 'D+7 NPS', d: 7 }, { passo: 'D+30 acessórios', d: 30 },
  { passo: 'D+90 bateria (só seminovo)', d: 90, so: 'seminovo' }, { passo: 'D+330 ciclo de troca', d: 330 },
]
// Alternativa, se o Lucas quiser uma régua "Geral" para quem não tem categoria de aparelho.
const REGUA_GERAL = [{ passo: 'D+7 NPS', d: 7 }, { passo: 'D+330 ciclo de troca', d: 330 }]
const NOME = { 1: 'iPhone/Smartphone', 2: 'iPad', 3: 'MacBook', 4: 'Watch/Smartwatch', 5: 'Outros', 6: 'Acessórios', 7: 'Perfumes' }

const sim = new Map()
const linhas = fs.readFileSync(SIM, 'utf8').replace(/^﻿/, '').split(/\r\n/)
const cab = linhas[0].split(';')
for (const l of linhas.slice(1)) { const c = l.split(';'); const o = Object.fromEntries(cab.map((k, i) => [k, c[i]])); sim.set(Number(o.negocio_id), { cat: Number(o.categoria_id) || null, cond: o.condicao || null }) }

const ganhos = []
for (let de = 0; ; de += 1000) {
  const { data, error } = await sb.from('negocios').select('id, ganho_em, dados, funil_id').eq('empresa_id', EMPRESA).eq('status', 'ganho').order('id').range(de, de + 999)
  if (error) throw error
  ganhos.push(...data); if (data.length < 1000) break
}
const { data: funis } = await sb.from('funis').select('id, interno').eq('empresa_id', EMPRESA)
const interno = new Set(funis.filter((f) => f.interno).map((f) => f.id))

const res = { hoje: HOJE, ganhos: 0, sem_data: 0, por_origem_categoria: {}, cenarios: {} }
for (const cenario of ['so_aparelhos', 'aparelhos_mais_geral']) {
  const c = { jornadas: 0, passos: 0, por_categoria: {}, por_mes: {}, por_passo: {}, por_categoria_mes: {}, pico_dia: {} }
  for (const g of ganhos) {
    if (interno.has(g.funil_id)) continue
    if (!g.ganho_em) { if (cenario === 'so_aparelhos') res.sem_data++; continue }
    const v = (g.dados && g.dados.venda) || null
    const s = sim.get(g.id)
    const cat = v?.categoria_id ?? s?.cat ?? null
    const cond = v?.condicao ?? s?.cond ?? null
    if (cenario === 'so_aparelhos') {
      res.ganhos++
      const k = `${v ? 'dados.venda' : s ? 'simulação 4B' : 'sem dado'} / ${cat ? NOME[cat] : 'sem categoria'}`
      res.por_origem_categoria[k] = (res.por_origem_categoria[k] || 0) + 1
    }
    const regua = [1, 2, 3, 4].includes(cat) ? REGUA_APARELHOS : cenario === 'aparelhos_mais_geral' ? REGUA_GERAL : null
    if (!regua) continue
    const d0 = dia(g.ganho_em)
    const futuros = regua.filter((p) => (!p.so || p.so === cond) && somar(d0, p.d) >= HOJE)
    if (!futuros.length) continue
    c.jornadas++
    const nomeCat = cat ? NOME[cat] : 'sem categoria (Geral)'
    for (const p of futuros) {
      const quando = somar(d0, p.d), mes = quando.slice(0, 7)
      c.passos++
      c.por_categoria[nomeCat] = (c.por_categoria[nomeCat] || 0) + 1
      c.por_mes[mes] = (c.por_mes[mes] || 0) + 1
      c.por_passo[p.passo] = (c.por_passo[p.passo] || 0) + 1
      const km = `${mes} ${nomeCat}`; c.por_categoria_mes[km] = (c.por_categoria_mes[km] || 0) + 1
      c.pico_dia[quando] = (c.pico_dia[quando] || 0) + 1
    }
  }
  const dias = Object.entries(c.pico_dia).sort((a, b) => b[1] - a[1])
  c.pico_dia = { maior: dias.slice(0, 5), dias_com_passo: dias.length }
  c.por_mes = Object.fromEntries(Object.entries(c.por_mes).sort())
  c.por_categoria_mes = Object.fromEntries(Object.entries(c.por_categoria_mes).sort())
  res.cenarios[cenario] = c
}
console.log(JSON.stringify(res, null, 1))
