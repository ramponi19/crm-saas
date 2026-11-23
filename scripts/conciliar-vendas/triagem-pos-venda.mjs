// Triagem da etapa "Pós Venda" (SO LEITURA): junta, para cada negocio aberto na etapa, os dados que
// a pessoa da triagem precisa para decidir (ganho com data / aberto em outra etapa / perdido).
// Nao grava nada no banco. Gera um JSON de trabalho; as sugestoes sao escritas a parte e o CSV final
// sai de montar-csv (ver o fim do arquivo).
//
// Uso: node --env-file=.env.local triagem-pos-venda.mjs <pedidos_extraidos.json> <sem_registro_ids.json> <saida.json>
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [PEDIDOS, SEMREG, SAIDA] = process.argv.slice(2)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EMPRESA = 1, ETAPA_POS_VENDA = 38
const pedidos = JSON.parse(fs.readFileSync(PEDIDOS, 'utf8'))
const semRegistro = new Set(JSON.parse(fs.readFileSync(SEMREG, 'utf8')).map(Number))
const limpa = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const COMPRA = /(comprei|j[aá] comprei|paguei|comprovante|fiz o pix|pix (feito|enviado)|vou levar|fechado|pode separar|retir(ar|ei|o) (hoje|amanh|na loja)|chegou (certinho|aqui)|recebi (o|a|meu|minha)|obrigad[oa] pela compra|parab[eé]ns pela compra|nota fiscal|seu pedido|pedido confirmado|confirmando (o )?pedido|amei o|ficou (lindo|perfeito))/i
const local = (iso) => iso ? new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : ''

const { data: negs, error } = await sb.from('negocios')
  .select('id, contato_id, filial_id, created_at, status, ativo, responsavel_id, produto:dados->>produto_interessado')
  .eq('empresa_id', EMPRESA).eq('etapa_id', ETAPA_POS_VENDA).eq('status', 'aberto').order('id')
if (error) throw error
const cids = negs.map((n) => n.contato_id)
const { data: contatos } = await sb.from('contatos').select('id, nome, telefone, telefone_e164').in('id', cids)
const { data: outros } = await sb.from('negocios').select('id, contato_id, status, ganho_em, etapa_id').in('contato_id', cids).eq('empresa_id', EMPRESA)
const { data: filiais } = await sb.from('filiais').select('id, nome, cidade').eq('empresa_id', EMPRESA)
const { data: perfis } = await sb.from('zapintel_lead_perfil').select('lead_id, perfil').in('lead_id', negs.map((n) => n.id)).eq('empresa_id', EMPRESA)
const C = new Map(contatos.map((c) => [c.id, c])), F = new Map(filiais.map((f) => [f.id, f.cidade || f.nome])), P = new Map(perfis.map((p) => [p.lead_id, p.perfil]))

const itens = []
for (const n of negs) {
  const c = C.get(n.contato_id) || {}
  let q = sb.from('mensagens').select('direcao, conteudo, transcricao, created_at').eq('empresa_id', EMPRESA).eq('contato_id', n.contato_id)
  q = n.filial_id == null ? q.is('filial_id', null) : q.eq('filial_id', n.filial_id)
  const { data: msgs, error: em } = await q.order('created_at', { ascending: false }).limit(400)
  if (em) throw em
  const texto = (m) => limpa(m.transcricao) || limpa(m.conteudo)
  const evid = msgs.filter((m) => COMPRA.test(texto(m))).slice(0, 3).map((m) => `${m.direcao === 'recebida' ? 'cliente' : 'loja'} ${local(m.created_at).slice(0, 10)}: ${texto(m).slice(0, 140)}`)
  const ultimasCliente = msgs.filter((m) => m.direcao === 'recebida').slice(0, 3).map((m) => `${local(m.created_at).slice(0, 10)}: ${texto(m).slice(0, 100)}`)
  const tel = c.telefone_e164 || ''
  const peds = tel ? pedidos.filter((p) => p.telefone_e164 === tel).map((p) => `${p.data_pedido} ${[p.modelo, p.cor].filter(Boolean).join(' ')} ${p.total || ''}`.trim()) : []
  const pf = P.get(n.id) || {}
  itens.push({
    negocio_id: n.id, contato_id: n.contato_id, cliente: c.nome || '', telefone: tel || c.telefone || '', loja: F.get(n.filial_id) || '',
    criado_em: local(n.created_at).slice(0, 10), ultima_interacao: msgs[0] ? local(msgs[0].created_at) : '(sem conversa)',
    ultima_do_cliente: msgs.find((m) => m.direcao === 'recebida') ? local(msgs.find((m) => m.direcao === 'recebida').created_at) : '',
    mensagens: msgs.length, sem_registro: semRegistro.has(n.id), produto: n.produto || '',
    ia_classe: pf.classificacao || '', ia_relato: limpa(pf.relato || pf.diagnostico).slice(0, 300), ia_proxima: limpa(pf.proximaAcao).slice(0, 120),
    evidencias: evid, ultimas_do_cliente: ultimasCliente, pedidos_no_grupo: peds,
    outros_negocios: outros.filter((o) => o.contato_id === n.contato_id && o.id !== n.id).map((o) => `${o.id}:${o.status}${o.ganho_em ? ' ' + o.ganho_em.slice(0, 10) : ''}`),
  })
}
fs.writeFileSync(SAIDA, JSON.stringify(itens, null, 1))
console.log(JSON.stringify({ negocios: itens.length, sem_registro: itens.filter((i) => i.sem_registro).length, com_evidencia: itens.filter((i) => i.evidencias.length).length,
  com_pedido: itens.filter((i) => i.pedidos_no_grupo.length).length, com_outro_ganho: itens.filter((i) => i.outros_negocios.some((o) => o.includes('ganho'))).length }))
