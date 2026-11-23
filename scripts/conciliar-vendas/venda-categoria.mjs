// Categoria e condição da venda para os negócios convertidos pela conciliação (SIMULAÇÃO por padrão).
// Lê o pedido do grupo (modelo, cor e o texto da mensagem, sem as linhas de entrada/troca) e propõe
// dados.venda.categoria_id e .condicao. Não identificou → fica sem (régua "Geral").
//
// Uso: node --env-file=.env.local venda-categoria.mjs <pedidos_extraidos.json> <saida.csv>
// Só SELECT. A gravação é um passo à parte, com o ok do Lucas.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { NOME, classificar } from './classificar-item.mjs'

const [PEDIDOS, SAIDA] = process.argv.slice(2)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EMPRESA = 1
const pedidos = new Map(JSON.parse(fs.readFileSync(PEDIDOS, 'utf8')).map((p) => [p.id_pedido, p]))

// Regras em classificar-item.mjs (as mesmas dos ganhos antigos).

const { data: backup, error } = await sb.from('_backup_conciliacao_20261123').select('negocio_id, origem, id_pedido').order('negocio_id')
if (error) throw error
const ids = backup.map((b) => b.negocio_id)
const { data: negs } = await sb.from('negocios').select('id, status, valor_estimado, dados').in('id', ids).eq('empresa_id', EMPRESA)
const N = new Map(negs.map((n) => [n.id, n]))

const linhas = []
for (const b of backup) {
  const ps = String(b.id_pedido || '').split(' + ').map((i) => pedidos.get(i.trim())).filter(Boolean)
  const { principal, categoria, condicao, fonte } = classificar(ps)
  const n = N.get(b.negocio_id)
  linhas.push({
    negocio_id: b.negocio_id, origem: b.origem, status_atual: n?.status ?? '?', ja_tem_venda: !!(n?.dados && n.dados.venda),
    id_pedido: b.id_pedido, modelo: principal?.modelo ?? '', cor: principal?.cor ?? '',
    categoria_id: categoria, categoria: categoria ? NOME[categoria] : '(sem — régua Geral)', condicao: condicao ?? '', fonte_condicao: fonte,
  })
}

const esc = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const cols = Object.keys(linhas[0])
fs.writeFileSync(SAIDA, '﻿' + [cols.join(';'), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(';'))].join('\r\n'), 'utf8')
const conta = (f) => linhas.reduce((o, l) => { const k = f(l); o[k] = (o[k] || 0) + 1; return o }, {})
console.log(JSON.stringify({
  total: linhas.length,
  status: conta((l) => l.status_atual),
  ja_tem_venda: linhas.filter((l) => l.ja_tem_venda).length,
  por_categoria: conta((l) => l.categoria),
  por_condicao: conta((l) => l.condicao || '(sem)'),
  fonte_condicao: conta((l) => l.fonte_condicao || '(sem categoria)'),
  categoria_x_condicao: conta((l) => `${l.categoria} / ${l.condicao || '-'}`),
}, null, 1))
