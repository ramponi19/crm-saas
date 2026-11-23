// Categoria e condição da venda para os negócios convertidos pela conciliação (SIMULAÇÃO por padrão).
// Lê o pedido do grupo (modelo, cor e o texto da mensagem, sem as linhas de entrada/troca) e propõe
// dados.venda.categoria_id e .condicao. Não identificou → fica sem (régua "Geral").
//
// Uso: node --env-file=.env.local venda-categoria.mjs <pedidos_extraidos.json> <saida.csv>
// Só SELECT. A gravação é um passo à parte, com o ok do Lucas.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [PEDIDOS, SAIDA] = process.argv.slice(2)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EMPRESA = 1
const pedidos = new Map(JSON.parse(fs.readFileSync(PEDIDOS, 'utf8')).map((p) => [p.id_pedido, p]))

// Categorias da JM (estoque_categorias, conferidas em 23/11/2026)
const CAT = { iphone: 1, ipad: 2, mac: 3, watch: 4, outros: 5, acessorio: 6, perfume: 7 }
const NOME = { 1: 'iPhone', 2: 'iPad', 3: 'MacBook', 4: 'Apple Watch', 5: 'Outros', 6: 'Acessórios', 7: 'Perfumes' }
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function categoriaDe(t) {
  if (/\biphone\b|\bip\s?1[0-9]\b|\b1[1-7]\s?pro\b/.test(t)) return CAT.iphone
  if (/\bipad\b/.test(t)) return CAT.ipad
  if (/\bmac\s?book\b|\bmacbook\b|\bimac\b|\bmac mini\b/.test(t)) return CAT.mac
  if (/\bapple watch\b|\bwatch\b|\bse 2\b.*relogio|\brelogio\b/.test(t)) return CAT.watch
  // Celular e relógio de outra marca: as categorias da JM são "Iphone / Smartphone" e "Apple Watch / Smartwatch".
  if (/\bpoco\b|\bredmi\b|\bxiaomi\b|\bsamsung\b|\bgalaxy\b|\bmotorola\b/.test(t)) return CAT.iphone
  if (/\bgarmin\b|\bvivoactive\b|\bvenu\b|\bamazfit\b/.test(t)) return CAT.watch
  if (/\bperfume|\beau de\b|\bparfum|\bedp\b|\bedt\b|\b\d{2,3}\s?ml\b/.test(t)) return CAT.perfume
  if (/\bairpods?\b|\bcapa|\bcapinha|\bpelicula|\bfonte\b|\bcabo\b|\bcarregador|\bpencil\b|\bmagic mouse\b|\bteclado\b|\bcase\b|\bmagsafe\b|\bairtag\b|\bfone\b/.test(t)) return CAT.acessorio
  return null
}
const USADO = /semi-?novo|\busad[oa]\b|\bvitrine\b|\bbateria\s*:?\s*\d{2,3}\b|\b\d{2,3}\s*%|\bsaude\s*:?\s*\d{2,3}/
const NOVO = /\blacrad[oa]\b|\bnovo\b|\bnova\b/

// Só o que descreve o item vendido: modelo, cor e as linhas da mensagem que não são entrada/troca/pagamento.
function textoDoItem(p) {
  const linhas = String(p.texto_original || '').split(/\r?\n/)
    .filter((l) => !/^\s*(entrada|troca|aparelho|restante|a vista|à vista|credito|crédito|pix|debito|débito|contato|cliente|endere|vendedor|total)/i.test(l))
  return semAcento([p.modelo, p.cor, ...linhas].join(' \n '))
}

const { data: backup, error } = await sb.from('_backup_conciliacao_20261123').select('negocio_id, origem, id_pedido').order('negocio_id')
if (error) throw error
const ids = backup.map((b) => b.negocio_id)
const { data: negs } = await sb.from('negocios').select('id, status, valor_estimado, dados').in('id', ids).eq('empresa_id', EMPRESA)
const N = new Map(negs.map((n) => [n.id, n]))

const linhas = []
for (const b of backup) {
  const ps = String(b.id_pedido || '').split(' + ').map((i) => pedidos.get(i.trim())).filter(Boolean)
  // Mais de um pedido no mesmo negócio (aparelho + acessório): vale o de maior valor.
  const valorDe = (p) => Number(String(p.total || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0
  ps.sort((a, b2) => valorDe(b2) - valorDe(a))
  const principal = ps[0]
  const t = principal ? textoDoItem(principal) : ''
  const categoria = principal ? categoriaDe(semAcento([principal.modelo, principal.cor].join(' '))) ?? categoriaDe(t) : null
  let condicao = null, fonte = ''
  if (categoria != null) {
    if (USADO.test(t)) { condicao = 'seminovo'; fonte = 'texto: usado/seminovo/bateria' }
    else if (NOVO.test(t)) { condicao = 'novo'; fonte = 'texto: novo/lacrado' }
    else { condicao = 'novo'; fonte = 'sem indicação de usado → novo' }
    // iPhone de geração antiga sem indicação: provavelmente seminovo — marcado para conferir, regra não muda.
    const geracao = Number((/iphone\s*(\d{2})/.exec(t) || [])[1])
    if (categoria === CAT.iphone && fonte.startsWith('sem') && geracao && geracao <= 15) fonte = 'CONFERIR: modelo antigo sem indicação (provável seminovo)'
  }
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
